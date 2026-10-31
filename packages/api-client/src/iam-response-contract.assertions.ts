import type { components, operations } from './generated.js';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type ResponseBody200<Op> = Op extends {
  responses: { 200: { content: { 'application/json': unknown } } };
}
  ? Op['responses'][200]['content']['application/json']
  : never;

type ResponseBody201<Op> = Op extends {
  responses: { 201: { content: { 'application/json': unknown } } };
}
  ? Op['responses'][201]['content']['application/json']
  : never;

type ResponseBody202<Op> = Op extends {
  responses: { 202: { content: { 'application/json': unknown } } };
}
  ? Op['responses'][202]['content']['application/json']
  : never;

export type VerifyTypeChecks = [
  Expect<
    Equal<
      ResponseBody201<operations['AuthController_login_v1']>,
      components['schemas']['LoginResponseDto']
    >
  >,
  Expect<
    Equal<
      ResponseBody200<operations['AuthController_me_v1']>,
      components['schemas']['CurrentUserSummaryDto']
    >
  >,
  Expect<
    Equal<
      ResponseBody201<operations['MfaController_enroll_v1']>,
      components['schemas']['EnrollMfaResponseDto']
    >
  >,
  Expect<
    Equal<
      ResponseBody201<operations['MfaController_verify_v1']>,
      components['schemas']['VerifyMfaResponseDto']
    >
  >,
  Expect<
    Equal<
      ResponseBody200<operations['BranchesController_list_v1']>,
      components['schemas']['BranchesPageDto']
    >
  >,
  Expect<
    Equal<
      ResponseBody200<operations['BranchesController_read_v1']>,
      components['schemas']['BranchDto']
    >
  >,
  Expect<
    Equal<
      ResponseBody200<operations['RolesController_read_v1']>,
      components['schemas']['RoleWithGrantsDto']
    >
  >,
  Expect<
    Equal<
      ResponseBody200<operations['UsersController_read_v1']>,
      components['schemas']['UserSummaryDto']
    >
  >,
  Expect<
    Equal<
      ResponseBody202<operations['PhoneOtpController_request_v1']>,
      components['schemas']['RequestPhoneOtpResponseDto']
    >
  >,
  Expect<
    Equal<
      ResponseBody201<operations['PhoneOtpController_verify_v1']>,
      components['schemas']['LoginResponseDto']
    >
  >,
];
