# 🎓 2026 경기여자고등학교 수강신청 로드맵 시뮬레이터

> 2026학년도 입학생을 위한 맞춤형 수강신청 및 진로설계 웹 애플리케이션입니다. 학생들은 복잡한 교과군 필수 요건을 실시간으로 확인하며 2학년과 3학년의 과목을 미리 설계하고 PDF로 저장할 수 있습니다.


## 📱 반응형 모바일 UI (Responsive Mobile View)

모바일 환경에서도 직관적으로 사용할 수 있도록 1단 세로 스크롤 레이아웃과 하단 플로팅 툴바를 제공합니다.


## ✨ 주요 기능 (Key Features)

* **실시간 이수 조건 검사**: 선택한 과목 데이터를 바탕으로 교과군 필수 요건(국·수·영 8과목 이하, 기가/정보+제2외국어 4과목 이상, 예술 2과목 이상) 충족 여부를 하단 미니바에 실시간으로 피드백합니다.
* **과목별 상세 안내 (모달 지원)**: ⓘ 아이콘을 클릭하여 각 과목의 상세 설명(학교 제공 PDF 자료)이나 유튜브 안내 영상을 모달 창에서 바로 확인할 수 있습니다.
* **로드맵 임시저장 및 불러오기**:
  * **비로그인 유저**: 브라우저의 `localStorage`를 활용하여 안전하게 기기 내에 데이터를 임시저장하고 불러옵니다.
  * **로그인 유저 (서버 연동)**: MongoDB와 Vercel Serverless Functions를 연동하여 학생 계정별로 데이터를 서버에 저장하고 언제든 불러오거나 삭제할 수 있습니다.
* **PDF 내보내기**: 완성된 나만의 수강신청 로드맵을 A4 사이즈의 PDF 문서로 즉시 변환하여 언제든 다운로드할 수 있습니다.
* **반응형 UI (Responsive Design)**: 데스크톱의 4단 가로 배치부터, 모바일 환경을 고려한 1단 세로 스크롤(Sticky 헤더 및 하단 플로팅 툴바 적용)까지 최적화된 사용자 경험을 제공합니다.

## 🛠 기술 스택 (Tech Stack)

### Frontend
* HTML5, CSS3, Vanilla JavaScript
* **Fonts**: Pretendard (UI/본문), Nanum Myeongjo (타이틀)
* **Libraries**: `html2canvas` (화면 캡처), `jsPDF` (PDF 생성)

### Backend & Database
* **Serverless API**: Vercel Functions (`/api/*`)
* **Database**: MongoDB (Atlas)
* **Authentication**: JWT (JSON Web Tokens)

## 📁 디렉토리 구조 (Directory Structure)

```text
📦 SUGANG
 ┣ 📂 api                       # Vercel Serverless Backend API
 ┃ ┣ 📂 admin
 ┃ ┃ ┗ 📜 matrix.js             # 관리자용 제출 현황 통계
 ┃ ┣ 📂 auth
 ┃ ┃ ┗ 📜 login.js              # JWT 기반 로그인 처리
 ┃ ┣ 📂 roadmaps
 ┃ ┃ ┣ 📜 [id].js               # 단일 로드맵 조회 및 삭제
 ┃ ┃ ┗ 📜 index.js              # 로드맵 목록 조회 및 임시저장
 ┃ ┗ 📜 submit.js               # 최종 제출 처리
 ┣ 📜 .gitignore
 ┣ 📜 atlas-credentials.env     # MongoDB 환경 변수 (로컬용)
 ┣ 📜 guide.pdf                 # 과목별 상세 안내 PDF 원본
 ┣ 📜 index.html                # 메인 프론트엔드 UI 및 로직
 ┣ 📜 package.json
 ┣ 📜 pdfviewer.html            # PDF 뷰어용 iframe 페이지
 ┣ 📜 README.md
 ┗ 📜 vercel.json               # Vercel 배포 설정 파일
