# VTK 데모 2 — GitHub → Render 배포

구성 (데모 1과 기기 역할 교체): PC = 키패드 B(숫자표시) + QR + 강조 토글 / 휴대폰 = 키패드 A(무표시 좌표입력)

폴더 구조 (저장소 루트에 그대로 위치해야 함):
```
package.json
server.js
public/
  index.html   (PC · 키패드 B)
  m.html       (휴대폰 · 키패드 A)
.gitignore
```

## 1. 로컬에서 Git 초기화 & 커밋
```bash
cd vtk-demo2
git init
git add .
git commit -m "VTK Demo 2: PC=Keypad B, Phone=Keypad A"
git branch -M main
```

## 2. GitHub 새 저장소 생성 후 연결
GitHub에서 New repository → 이름 `vtk-demo2` (README/.gitignore/license 모두 체크 해제, 빈 저장소).
```bash
git remote add origin https://github.com/<사용자명>/vtk-demo2.git
git push -u origin main
```

## 3. Render에서 새 Web Service 생성
1. dashboard.render.com → New → Web Service
2. `vtk-demo2` 저장소 연결
3. 설정:
   - Name: `vtk-demo2`  ← 이것만 입력. "→ URL https://..." 같은 문구를 붙이면 주소가 길어짐
   - Language: Node
   - Branch: main
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Free
4. Create Web Service → 자동 빌드·배포

포트는 process.env.PORT로 자동 처리됨. 환경변수 불필요. Root Directory는 비움.

## 4. 배포 후
- 발급된 `https://vtk-demo2.onrender.com` 을 PC에서 열고, QR을 휴대폰으로 스캔하여 시연.
- 이후 `git push` 할 때마다 자동 재배포됨.

## 데모 2 시연 흐름
1. PC: 등록(demo-user + 4자리 비밀번호) → 키패드 B(숫자표시) + QR 표시.
2. 휴대폰: QR 스캔 → 무표시 좌표입력 패드(키패드 A) 표시.
3. PC의 숫자판에서 비밀번호 위치를 확인 → 휴대폰의 무표시 패드에서 같은 위치를 순서대로 탭 → 인증 제출.
4. 입력 좌표는 휴대폰에서만 수집·전송되어, PC는 클릭 위치를 알지 못함(데모 1과 대칭).

## 주의
- 무료 플랜 콜드스타트: 약 15분 미사용 시 슬립 → 첫 접속 ~50초 지연. 발표 직전 URL을 한 번 열어 깨워둘 것.
- QR 외부 의존: QR을 외부 서비스(api.qrserver.com)로 생성하므로 발표장 네트워크가 막히면 QR이 안 뜰 수 있음(대체 URL 표시 기능 있음).
- 강조 토글은 PC의 키패드 B 화면에 있음. 실전 시연 시 "꺼짐"으로 두면 숫자판만 표시.
- 데모 1과 저장소·서비스 이름·URL이 모두 분리되어 서로 영향 없음.
