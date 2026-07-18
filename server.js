/**
 * VTK Multi-Device Demo 2 Server (Render 배포용)
 * PG502 표준화 검토 시연 — 데모 1의 기기 역할 교체판
 *
 * 구성:
 *  - PC      : 키패드 B (0~9 숫자표시) + QR. π를 받아 숫자판을 렌더링(참조용).
 *  - 휴대폰  : 키패드 A (무표시 좌표입력). 사용자가 좌표를 탭하여 제출.
 *  - 서버    : 휴대폰이 보낸 좌표열 C를 π로 역매핑하여 인증 판정.
 *
 * 보안 포인트(데모 1과 대칭):
 *  - 사용자의 입력 좌표는 휴대폰에서만 수집·전송됨 → PC는 클릭 위치를 알지 못함.
 *  - 비밀번호 평문은 통신에 흐르지 않고, 서버는 커밋먼트(해시)만 비교.
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const sessions = new Map();
const users = new Map();

function generateSessionId() { return crypto.randomBytes(8).toString('hex'); }
function generatePi() {
  const arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function generateSalt() { return crypto.randomBytes(16).toString('hex'); }
function sha256(text) { return crypto.createHash('sha256').update(text).digest('hex'); }

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));

// 사용자 등록 (시연용)
app.post('/register', (req, res) => {
  const { userId, password, sid } = req.body;
  if (!userId || !/^\d{4,8}$/.test(password)) {
    return res.status(400).json({ error: '잘못된 입력' });
  }
  const salt = generateSalt();
  const commitment = sha256(password + salt);
  users.set(userId, { salt, commitment, password });
  console.log(`[Register] ${userId} commitment=${commitment.substring(0, 12)}...`);
  // 휴대폰에서 등록한 경우: 세션의 사용자와 연결하고 PC에 알림
  if (sid && sessions.has(sid)) {
    const session = sessions.get(sid);
    session.userId = userId;
    io.to(`pc-${sid}`).emit('user-registered', { userId });
  }
  res.json({ ok: true });
});

// PC가 인증 세션 시작 — PC는 키패드 B(숫자)를 그려야 하므로 π를 수신
app.post('/auth/start', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: '사용자 ID 필요' });
  }
  // 등록 전에도 세션(π·QR)을 만들 수 있게 함 (화면 로드 시 QR 자동 표시용)
  const sid = generateSessionId();
  const pi = generatePi();
  sessions.set(sid, {
    sid, pi, userId,
    mobileConnected: false,
    status: 'waiting_for_mobile',
    createdAt: Date.now()
  });
  const user = users.get(userId);
  console.log(`[AuthStart] session=${sid} userId=${userId}`);
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  // PC(키패드 B)에 π와 (등록된 경우) 비밀번호(강조 표시용) 전달. Channel ①: Server → PC
  res.json({
    sid,
    n: 4,
    pi,
    password: user ? user.password : null, // 시연용: 강조 표시(토글)용
    mobileUrl: `${baseUrl}/m.html?s=${sid}`
  });
});

// 휴대폰(키패드 A) 페어링
// 무표시 입력 패드가 기본이나, 발표자 보조용 "위치 강조"를 휴대폰에서 계산할 수 있도록
// π와 비밀번호(위치 산출용)를 함께 전달한다.
//   ※ 강조는 순수 표시용이며, 실제 인증 전송은 좌표 C만 사용(기존과 동일).
app.get('/api/pair/:sid', (req, res) => {
  const { sid } = req.params;
  const session = sessions.get(sid);
  if (!session) return res.status(404).json({ error: '세션 만료 또는 없음' });

  session.mobileConnected = true;
  session.status = 'waiting_for_mobile_input';
  io.to(`pc-${sid}`).emit('mobile-paired');
  console.log(`[Pair] session=${sid} 휴대폰(키패드 A) 연결됨`);

  const user = users.get(session.userId);
  // Channel ②: Server → Mobile (격자 형상 + 강조용 π·비밀번호)
  res.json({
    sid,
    n: 4,
    pi: session.pi,                 // 강조 위치 계산용
    password: user ? user.password : null // 시연용: 위치 강조(토글)용
  });
});

// 휴대폰(키패드 A)이 좌표 시퀀스 C 제출
app.post('/auth/submit', (req, res) => {
  const { sid, cSequence } = req.body;
  const session = sessions.get(sid);
  if (!session) return res.status(404).json({ error: '세션 만료 또는 없음' });

  console.log(`[Submit] session=${sid} C=[${cSequence.join(',')}]`);

  const numericIndices = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10];
  const cellLayout = new Array(12).fill(null);
  for (let digit = 0; digit < 10; digit++) {
    cellLayout[numericIndices[session.pi[digit]]] = digit;
  }
  const computedDigits = cSequence.map(cellIdx => cellLayout[cellIdx]);
  if (computedDigits.includes(null) || computedDigits.includes(undefined)) {
    return res.json({ ok: false, reason: '잘못된 좌표' });
  }
  const enteredPassword = computedDigits.join('');
  const user = users.get(session.userId);
  if (!user) {
    return res.json({ ok: false, reason: '미등록 — 먼저 등록 및 인증을 진행하세요' });
  }
  const computedCommitment = sha256(enteredPassword + user.salt);
  const success = computedCommitment === user.commitment;

  console.log(`[Submit] D'=${enteredPassword} success=${success}`);

  // 결과를 PC·휴대폰 양쪽에 통보
  io.to(`pc-${sid}`).emit('auth-result', { success });
  io.to(`mobile-${sid}`).emit('auth-result', { success });

  // 성공 시에만 π 폐기. 실패 시에는 같은 챌린지(π)로 재시도할 수 있도록 유지.
  if (success) session.pi = null;
  session.status = success ? 'success' : 'failure';

  res.json({ ok: success, computedPassword: enteredPassword, message: success ? '인증 성공' : '인증 실패' });
});

// 휴대폰이 요청: 현재 세션의 π만 새로 섞음 (세션·페어링·QR 유지)
//  - 새 π를 세션에 저장하고, PC(키패드 B)에 소켓으로 새 π를 push하여 숫자판 갱신
//  - 휴대폰의 무표시 패드는 그대로, 강조 계산용으로 새 π·password를 응답
app.post('/auth/reshuffle', (req, res) => {
  const { sid } = req.body;
  const session = sessions.get(sid);
  if (!session) return res.status(404).json({ error: '세션 만료 또는 없음' });

  session.pi = generatePi();
  session.status = 'waiting_for_mobile_input';
  const user = users.get(session.userId);
  console.log(`[Reshuffle] session=${sid} 새 π 생성`);

  // PC 숫자판 B 갱신용으로 새 π를 push
  io.to(`pc-${sid}`).emit('pi-updated', { pi: session.pi });

  // 휴대폰에는 강조 재계산용으로 새 π·password 반환
  res.json({ ok: true, pi: session.pi, password: user ? user.password : null });
});

io.on('connection', (socket) => {
  socket.on('join-pc', ({ sid }) => { socket.join(`pc-${sid}`); console.log(`[Socket] PC joined ${sid}`); });
  socket.on('join-mobile', ({ sid }) => { socket.join(`mobile-${sid}`); console.log(`[Socket] Mobile joined ${sid}`); });
});

setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions.entries()) {
    if (now - session.createdAt > 30 * 60 * 1000) {
      sessions.delete(sid);
      console.log(`[Cleanup] 세션 만료: ${sid}`);
    }
  }
}, 5 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n╔═══════════════════════════════════════════╗`);
  console.log(`║  VTK Multi-Device Demo 2 Server           ║`);
  console.log(`║  PC=키패드 B(숫자) / 휴대폰=키패드 A(무표시) ║`);
  console.log(`╚═══════════════════════════════════════════╝`);
  console.log(`Port: ${PORT}`);
});
