// req.user 부분 인터페이스
declare global {
  namespace Express {
    export interface User extends ReqUser {}
    export interface Request {
      user?: ReqUser; // user 속성 추가
      session: any; // 또는 좀 더 구체적인 타입을 사용할 수 있습니다.
    }

    namespace Multer {
      interface File {
        location?: string; // 여기에 필요한 다른 속성을 추가할 수 있습니다.
      }
    }
  }
}

export type ReqUser = {
  id: number;
};
