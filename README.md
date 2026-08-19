# Classic Minesweeper for SillyTavern

생성 응답을 기다리는 동안 가볍게 플레이할 수 있는 독립형 지뢰찾기 확장입니다. API를 사용하지 않으며 채팅, 캐릭터, RP 내용에 접근하지 않습니다.

## 기능

- Windows 9x 스타일의 클래식 지뢰찾기
- 초급: 9×9, 지뢰 10개
- 중급: 16×16, 지뢰 40개
- 첫 클릭 안전 처리
- 플로팅 버튼으로 게임 창 열기/닫기
- 창을 닫아도 현재 판 유지, 닫힌 동안 타이머 일시정지
- PC: 좌클릭으로 열기, 우클릭으로 깃발, 열린 숫자에서 양쪽 클릭으로 주변 열기
- 모바일: 짧게 눌러 열기, 길게 눌러 깃발
- 모바일용 `칸 열기 / 깃발` 모드 버튼
- Windows Classic / 현재 실리태번 테마 / 사용자 테마
- 사용자 테마 생성, 복제, 삭제, JSON 내보내기·불러오기
- 플로팅 버튼 드래그 이동 및 위치 저장

## 설치

1. 압축을 풉니다.
2. `ST-Classic-Minesweeper` 폴더 전체를 다음 위치에 넣습니다.
   - 사용자별 설치: `SillyTavern/data/<사용자>/extensions/`
   - 전체 사용자 설치: `SillyTavern/public/scripts/extensions/third-party/`
3. SillyTavern을 새로고침합니다.

확장 폴더 이름은 `ST-Classic-Minesweeper` 그대로 유지해 주세요.

## 슬래시 명령

```text
/minesweeper
/ms
```

게임 창을 토글합니다.

```text
/ms open
/ms close
/ms new
/ms beginner
/ms intermediate
```

`/지뢰찾기`, `열기`, `닫기`, `새게임`, `초급`, `중급`도 사용할 수 있습니다.

## 조작

- 웃는 얼굴: 현재 난이도로 새 게임
- PC에서 열린 숫자 칸 양쪽 클릭: 주변 깃발 수가 숫자와 같으면 나머지 주변 칸 열기
- 모바일에서 열린 숫자 칸 다시 터치: 같은 방식으로 나머지 주변 칸 열기
- 플로팅 버튼 드래그: 버튼 위치 이동

## 개발 테스트

Node.js 18 이상에서 다음 명령을 실행합니다.

```bash
npm test
```

## 라이선스

MIT
