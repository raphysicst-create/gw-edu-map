import type { EducationIssue } from "../../issues/types";

export const POLICY_SOURCE = {
  name: "강원특별자치도교육청 주요업무계획",
  url: "https://www.gwe.go.kr/main/content.do?key=bTIzMDcyMTEyMTA5NTQ%3D",
  referenceDate: "",
};

const topics = [
  ["school-size", "학교 규모 차이", "학교급별 학생 분포와 작은학교는 어떻게 다른가?", ["school-size"], "학교별 학생수·본분교·운영상태와 강원 정책 근거"],
  ["regional-sustainability", "지역소멸과 작은학교", "학생이 줄어드는 지역의 학교는 어떤 상황인가?", ["decline-small", "designation", "student-change", "small-share", "zero-entrants"], "행정안전부 지정 근거와 비교 가능한 학교 시계열"],
  ["special-education", "특수교육 현황", "일반학교 특수학급과 특수학교는 어디에 분포하는가?", ["special-classes", "special-students", "special-schools"], "일반학교 특수학급과 특수학교의 구분된 공식 통계"],
  ["closed-assets", "폐교 활용 현황", "등재 폐교재산은 어떻게 활용되고 있는가?", ["unused-count", "unused-share"], "전체 폐교재산 명단·현재 활용상태·가공 및 재배포 조건"],
  ["basic-learning", "기초학력 지원", "지역별 기초학력 지원 자원은 어디에 있는가?", ["basic-centers"], "교육청 소속 지원센터의 공식 명단과 지원 범위"],
  ["reading", "독서 교육환경", "교육청 도서관과 학교 사서교사는 어떻게 배치되어 있는가?", ["libraries", "librarian-schools"], "교육청 도서관 명단과 학교별 사서교사 통계"],
  ["care", "돌봄 환경", "학교 돌봄과 지역 돌봄 자원은 어디에 있는가?", ["care-pilots", "care-centers"], "강원교육청·강원도청의 돌봄 명단과 운영 범위"],
  ["wellbeing", "마음건강 지원", "Wee센터와 학교 상담교사는 어떻게 배치되어 있는가?", ["wee-centers", "counselor-schools"], "Wee센터 공식 명단과 학교별 상담교사 배치 통계"],
  ["career", "진로교육 지원", "지역에서 이용할 수 있는 진로교육 지원은 무엇인가?", ["career-regions"], "강원교육청 공식 진로 사업과 제공 지역"],
  ["ai-education", "AI 교육환경", "AI 교육 지정학교와 교육자원은 어디에 있는가?", ["ai-focus-schools"], "적용연도별 공식 지정학교 명단·사업명·대상·기간"],
] as const;

/** These are research questions, not unverified claims about government policy. */
export const EDUCATION_ISSUES: EducationIssue[] = topics.map(([id, title, question, metrics, dataNeeded]) => ({
  id, title, question, description: question, metrics: [...metrics], dataNeeded,
  policy: "공식 정책 문서 확인 중", policyPage: null, policyTask: "", status: "planned",
}));
