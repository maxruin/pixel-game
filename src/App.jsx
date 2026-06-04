import React, { useState, useEffect } from 'react';
import { playSound } from './utils/sound';

const GAS_URL = import.meta.env.VITE_GOOGLE_APP_SCRIPT_URL || '';
const PASS_THRESHOLD = parseInt(import.meta.env.VITE_PASS_THRESHOLD, 10) || 3;
const QUESTION_COUNT = parseInt(import.meta.env.VITE_QUESTION_COUNT, 10) || 5;

// 關主台詞庫
const BOSS_QUOTES = [
  "你能解開這個謎題嗎？冒險者！",
  "小心了，這題可沒那麼簡單！",
  "哈哈！這題是我的得意之作！",
  "投幣吧，這就是你的命運！",
  "別妄想能輕易從我這拿到分數！",
  "哼，看你能在這裡撐多久！",
  "答錯的話，我的像素大刀可不長眼！",
  "你的智慧能超越 8-bit 的極限嗎？",
  "準備好接受挑戰了嗎？",
  "答題速度太慢的話，我就要生氣了！"
];

function App() {
  const [screen, setScreen] = useState('loading'); // loading | start | fetching | playing | submitting | result | error
  const [userId, setUserId] = useState('');
  const [preloadCount, setPreloadCount] = useState(0);
  const [bossAvatars, setBossAvatars] = useState([]);
  
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState([]); // [{ questionId, selected }]
  
  const [apiResult, setApiResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [assignedBosses, setAssignedBosses] = useState([]); // 每一題指派的關主頭像與台詞

  // 1. 預載 100 張 DiceBear 關主圖片
  useEffect(() => {
    let loaded = 0;
    const total = 100;
    const urls = Array.from({ length: total }, (_, i) => 
      `https://api.dicebear.com/7.x/pixel-art/svg?seed=Boss_${i + 1}`
    );

    urls.forEach(url => {
      const img = new Image();
      img.src = url;
      const onImageLoad = () => {
        loaded++;
        setPreloadCount(loaded);
        if (loaded === total) {
          setBossAvatars(urls);
          setScreen('start');
        }
      };
      img.onload = onImageLoad;
      img.onerror = onImageLoad; // 避免單張失敗導致卡死
    });
  }, []);

  // 2. 開始遊戲：獲取題目
  const handleStartGame = async (e) => {
    e.preventDefault();
    if (!userId.trim()) return;

    playSound('click');
    setScreen('fetching');
    setErrorMsg('');

    if (!GAS_URL) {
      setErrorMsg('未配置環境變數 VITE_GOOGLE_APP_SCRIPT_URL。請檢查您的 .env 檔案。');
      setScreen('error');
      return;
    }

    try {
      const response = await fetch(`${GAS_URL}?action=getQuestions&count=${QUESTION_COUNT}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.questions || data.questions.length === 0) {
        throw new Error('無法取得題目，請確認試算表中有無題目數據。');
      }

      // 為每題隨機指派一個關主圖片與隨機台詞
      const assigned = data.questions.map(() => {
        const avatarIdx = Math.floor(Math.random() * bossAvatars.length);
        const quoteIdx = Math.floor(Math.random() * BOSS_QUOTES.length);
        return {
          avatar: bossAvatars[avatarIdx],
          quote: BOSS_QUOTES[quoteIdx]
        };
      });

      setQuestions(data.questions);
      setAssignedBosses(assigned);
      setCurrentIdx(0);
      setAnswers([]);
      setScreen('playing');
    } catch (err) {
      console.error(err);
      setErrorMsg(`取得題目失敗：${err.message}`);
      setScreen('error');
    }
  };

  // 3. 玩家作答
  const handleSelectOption = (optionKey) => {
    playSound('click');
    const newAnswers = [...answers, { 
      questionId: questions[currentIdx].id, 
      selected: optionKey 
    }];
    setAnswers(newAnswers);

    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(currentIdx + 1);
    } else {
      // 最後一題答完，提交答案
      handleSubmit(newAnswers);
    }
  };

  // 4. 提交答案到 GAS
  const handleSubmit = async (finalAnswers) => {
    setScreen('submitting');
    
    try {
      // 使用 text/plain 來避免 CORS Preflight OPTIONS 請求
      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify({
          action: 'submitAnswers',
          id: userId,
          answers: finalAnswers
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }
      
      setApiResult(data);
      
      // 根據答對題數判斷是否通過，並播放音效
      // 注意：GAS 端回傳 data.score，我們用前端 VITE_PASS_THRESHOLD 作為主要判斷
      const isPassed = data.score >= PASS_THRESHOLD;
      if (isPassed) {
        playSound('victory');
      } else {
        playSound('gameover');
      }
      
      setScreen('result');
    } catch (err) {
      console.error(err);
      setErrorMsg(`提交答案失敗：${err.message}`);
      setScreen('error');
    }
  };

  // 5. 重新開始
  const handleReset = () => {
    playSound('click');
    setQuestions([]);
    setAnswers([]);
    setApiResult(null);
    setErrorMsg('');
    setScreen('start');
  };

  return (
    <div className="game-container">
      {/* 載入中畫面 */}
      {screen === 'loading' && (
        <div>
          <h1 className="arcade-title">LOADING ROM...</h1>
          <div className="loading-stripes"></div>
          <p className="pixel-font" style={{ fontSize: '18px' }}>
            預載關主素材 ({preloadCount}/100)
          </p>
          <p className="blink pixel-font" style={{ marginTop: '20px', color: 'var(--color-secondary)' }}>
            PLEASE WAIT...
          </p>
        </div>
      )}

      {/* 首頁 (輸入 ID) */}
      {screen === 'start' && (
        <form onSubmit={handleStartGame}>
          <h1 className="arcade-title">PIXEL QUIZ<br />QUEST</h1>
          
          <div className="pixel-box" style={{ margin: '30px 0' }}>
            <p className="pixel-font" style={{ color: 'var(--color-blue)', marginBottom: '15px' }}>
              輸入冒險者 ID 開始挑戰
            </p>
            <input
              type="text"
              className="pixel-input"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="PLAYER_ID"
              maxLength={20}
              required
            />
          </div>

          <button type="submit" className="pixel-btn pixel-btn-primary pixel-font blink">
            INSERT COIN & START
          </button>
        </form>
      )}

      {/* 正在撈取題目 */}
      {screen === 'fetching' && (
        <div>
          <h1 className="arcade-title">GENERATING QUEST...</h1>
          <div className="loading-stripes"></div>
          <p className="pixel-font blink" style={{ fontSize: '18px', color: 'var(--color-accent)' }}>
            正在與試算表同步...
          </p>
        </div>
      )}

      {/* 答題畫面 */}
      {screen === 'playing' && questions.length > 0 && (
        <div>
          {/* HUD (資訊欄) */}
          <div className="hud-container pixel-font">
            <div>PLAYER: {userId}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              STAGE: {currentIdx + 1}/{questions.length}
              <div className="progress-bar-outer">
                <div 
                  className="progress-bar-inner" 
                  style={{ width: `${((currentIdx) / questions.length) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* 關主頭像與對話框 */}
          <div className="boss-wrapper">
            <div className="boss-avatar-box">
              <img 
                src={assignedBosses[currentIdx]?.avatar} 
                alt="關主" 
                className="boss-avatar" 
              />
            </div>
            <div className="pixel-font neon-pink" style={{ fontSize: '10px' }}>
              STAGE BOSS {currentIdx + 1}
            </div>
            
            <div className="pixel-bubble">
              <span style={{ fontSize: '20px', display: 'block', marginBottom: '8px', color: 'var(--color-accent)' }}>
                "{assignedBosses[currentIdx]?.quote}"
              </span>
              <span style={{ fontSize: '24px', color: '#fff', display: 'block' }}>
                {questions[currentIdx]?.question}
              </span>
            </div>
          </div>

          {/* 選項 */}
          <div className="options-grid">
            {Object.entries(questions[currentIdx]?.options || {}).map(([key, val]) => (
              val && (
                <button
                  key={key}
                  onClick={() => handleSelectOption(key)}
                  className="pixel-btn option-btn"
                >
                  <span className="neon-yellow" style={{ marginRight: '10px' }}>[{key}]</span>
                  {val}
                </button>
              )
            ))}
          </div>
        </div>
      )}

      {/* 答案提交中 */}
      {screen === 'submitting' && (
        <div>
          <h1 className="arcade-title">SUBMITTING RESULTS...</h1>
          <div className="loading-stripes"></div>
          <p className="pixel-font blink" style={{ fontSize: '18px', color: 'var(--color-secondary)' }}>
            正在計算成績並寫入資料庫...
          </p>
        </div>
      )}

      {/* 結算畫面 */}
      {screen === 'result' && apiResult && (
        <div>
          {apiResult.score >= PASS_THRESHOLD ? (
            <h1 className="arcade-title neon-green" style={{ textShadow: '0 0 10px var(--color-primary)' }}>
              VICTORY!
            </h1>
          ) : (
            <h1 className="arcade-title neon-pink" style={{ textShadow: '0 0 10px var(--color-secondary)' }}>
              GAME OVER
            </h1>
          )}

          <div className="pixel-box" style={{ textAlign: 'left', padding: '20px' }}>
            <p className="pixel-font" style={{ color: 'var(--color-accent)', fontSize: '16px', borderBottom: '2px dashed #fff', paddingBottom: '10px' }}>
              冒險報告 - {userId}
            </p>
            
            <table className="pixel-font" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '15px' }}>
              <tbody>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--color-blue)' }}>本次答對題數:</td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {apiResult.score} / {apiResult.totalQuestions}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--color-blue)' }}>通過門檻:</td>
                  <td style={{ textAlign: 'right' }}>{PASS_THRESHOLD} 題</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--color-blue)' }}>闖關次數:</td>
                  <td style={{ textAlign: 'right' }}>{apiResult.playCount}</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--color-blue)' }}>歷史最高分:</td>
                  <td style={{ textAlign: 'right', color: 'var(--color-accent)' }}>{apiResult.maxScore} 分</td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--color-blue)' }}>首次通關得分:</td>
                  <td style={{ textAlign: 'right' }}>
                    {apiResult.firstPassScore !== "" ? `${apiResult.firstPassScore} 分` : "尚未通關"}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '8px 0', color: 'var(--color-blue)' }}>花了幾次通關:</td>
                  <td style={{ textAlign: 'right' }}>
                    {apiResult.attemptsToPass !== "" ? `${apiResult.attemptsToPass} 次` : "N/A"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '30px', display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <button onClick={handleReset} className="pixel-btn pixel-btn-primary pixel-font">
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}

      {/* 錯誤畫面 */}
      {screen === 'error' && (
        <div>
          <h1 className="arcade-title neon-pink">SYSTEM ERROR</h1>
          <div className="pixel-box pixel-box-pink" style={{ margin: '30px 0' }}>
            <p className="pixel-font" style={{ color: 'var(--color-secondary)', fontSize: '12px', wordBreak: 'break-all' }}>
              {errorMsg}
            </p>
          </div>
          <button onClick={handleReset} className="pixel-btn pixel-btn-secondary pixel-font">
            BACK TO HOME
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
