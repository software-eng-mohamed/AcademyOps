import { buildQuery, type RequestOptions } from './base.js';
import { PlgBaseClient } from './base-client.js';
import type { AuditEvent, AuditEventsPage } from './models.js';
import type * as O from './owner-models.js';
import {
  validateCohortsPage,
  validateModulesPage,
  validateProgramsPage,
  validateRoomsPage,
  validateStudentDetail,
  validateStudentsPage,
  validateTrainersPage,
} from './owner-validators.js';

export class PlgOwnerClient extends PlgBaseClient {
  async listStudents(
    query: O.CatalogQuery & {
      enrollmentState?: string;
    },
    options?: RequestOptions,
  ) {
    return validateStudentsPage(
      await this.request('GET', `/students${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  async getStudent(id: string, options?: RequestOptions): Promise<O.OwnerStudentDetail> {
    return validateStudentDetail(
      await this.request(
        'GET',
        `/students/${encodeURIComponent(id)}`,
        undefined,
        undefined,
        options,
      ),
    );
  }
  createStudent(input: O.CreateStudentInput): Promise<
    O.OwnerMutation & {
      publicId: string;
    }
  > {
    return this.request('POST', '/students', input);
  }
  updateStudent(
    id: string,
    input: {
      name?: string;
      birthDate?: string;
      gender?: string;
    },
    version: number,
  ): Promise<O.OwnerStudentIdentityMutation> {
    return this.request('PATCH', `/students/${encodeURIComponent(id)}`, input, {
      'If-Match': String(version),
    });
  }
  replaceStudentContacts(
    id: string,
    contacts: O.StudentContactInput[],
    version: number,
  ): Promise<O.StudentContactsMutation> {
    return this.request(
      'PUT',
      `/students/${encodeURIComponent(id)}/contacts`,
      { contacts },
      { 'If-Match': String(version) },
    );
  }
  mergeStudent(
    sourcePersonId: string,
    targetPersonId: string,
    targetVersion: number,
    reason: string,
    sourceVersion: number,
    idempotencyKey: string,
  ): Promise<O.StudentMergeResult> {
    return this.request(
      'POST',
      `/students/${encodeURIComponent(sourcePersonId)}/merge`,
      { targetPersonId, targetVersion, reason },
      { 'If-Match': String(sourceVersion), 'idempotency-key': idempotencyKey },
    );
  }
  listAuditEvents(query: O.AuditEventsQuery = {}, options?: RequestOptions) {
    return this.request<AuditEventsPage>(
      'GET',
      `/audit-events${buildQuery(query)}`,
      undefined,
      undefined,
      options,
    );
  }
  getAuditEvent(id: string, options?: RequestOptions): Promise<AuditEvent> {
    return this.request(
      'GET',
      `/audit-events/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      options,
    );
  }
  async listPrograms(query: O.CatalogQuery = {}, options?: RequestOptions) {
    return validateProgramsPage(
      await this.request('GET', `/programs${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  getProgram(id: string, options?: RequestOptions): Promise<O.OwnerProgram> {
    return this.request(
      'GET',
      `/programs/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      options,
    );
  }
  getProgramVersion(id: string, options?: RequestOptions): Promise<O.OwnerProgramVersionDetail> {
    return this.request(
      'GET',
      `/program-versions/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      options,
    );
  }
  createProgram(input: { code: string; name: string }): Promise<Omit<O.OwnerProgram, 'versions'>> {
    return this.request('POST', '/programs', input);
  }
  updateProgram(
    id: string,
    input: {
      name?: string;
      status?: 'ACTIVE' | 'ARCHIVED';
    },
    version: number,
  ): Promise<Omit<O.OwnerProgram, 'versions'>> {
    return this.request('PATCH', `/programs/${encodeURIComponent(id)}`, input, {
      'If-Match': String(version),
    });
  }
  createProgramVersion(
    programId: string,
    input: {
      effectiveFrom?: string | undefined;
      modules: O.CurriculumLine[];
    },
  ): Promise<O.OwnerProgramVersion> {
    return this.request('POST', `/programs/${encodeURIComponent(programId)}/versions`, input);
  }
  publishProgramVersion(
    id: string,
    effectiveFrom: string,
    version: number,
  ): Promise<O.OwnerProgramVersion> {
    return this.request(
      'POST',
      `/program-versions/${encodeURIComponent(id)}/publish`,
      { effectiveFrom },
      { 'If-Match': String(version) },
    );
  }
  replaceProgramVersionCurriculum(
    id: string,
    modules: O.CurriculumLine[],
    recordVersion: number,
  ): Promise<{
    id: string;
    recordVersion: number;
    modules: O.CurriculumLine[];
  }> {
    return this.request(
      'PUT',
      `/program-versions/${encodeURIComponent(id)}/curriculum`,
      { modules },
      { 'If-Match': String(recordVersion) },
    );
  }
  archiveProgramVersion(
    id: string,
    reason: string,
    recordVersion: number,
  ): Promise<O.OwnerProgramVersion> {
    return this.request(
      'POST',
      `/program-versions/${encodeURIComponent(id)}/archive`,
      { reason },
      { 'If-Match': String(recordVersion) },
    );
  }
  async listModules(query: O.CatalogQuery = {}, options?: RequestOptions) {
    return validateModulesPage(
      await this.request('GET', `/modules${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  createModule(input: { code: string; name: string }): Promise<O.OwnerModule> {
    return this.request('POST', '/modules', input);
  }
  updateModule(
    id: string,
    input: {
      name?: string;
      isActive?: boolean;
    },
    version: number,
  ): Promise<O.OwnerModule> {
    return this.request('PATCH', `/modules/${encodeURIComponent(id)}`, input, {
      'If-Match': String(version),
    });
  }
  async listCohorts(query: O.CatalogQuery = {}, options?: RequestOptions) {
    return validateCohortsPage(
      await this.request('GET', `/cohorts${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  getCohort(id: string, options?: RequestOptions): Promise<O.OwnerCohort> {
    return this.request('GET', `/cohorts/${encodeURIComponent(id)}`, undefined, undefined, options);
  }
  createCohort(input: {
    programVersionId: string;
    owningBranchId: string;
    code: string;
    name?: string | undefined;
    startsOn?: string | undefined;
    endsOn?: string | undefined;
    capacity?: number | undefined;
  }): Promise<O.OwnerCohort> {
    return this.request('POST', '/cohorts', input);
  }
  updateCohort(
    id: string,
    input: {
      name?: string | undefined;
      startsOn?: string | undefined;
      endsOn?: string | undefined;
      capacity?: number | undefined;
    },
    version: number,
  ): Promise<O.OwnerCohort> {
    return this.request('PATCH', `/cohorts/${encodeURIComponent(id)}`, input, {
      'If-Match': String(version),
    });
  }
  transitionCohort(
    id: string,
    command: 'plan' | 'activate' | 'complete' | 'cancel',
    reason: string,
    version: number,
  ): Promise<O.OwnerCohort> {
    return this.request(
      'POST',
      `/cohorts/${encodeURIComponent(id)}/${command}`,
      { reason },
      {
        'If-Match': String(version),
      },
    );
  }
  async listRooms(query: O.CatalogQuery = {}, options?: RequestOptions) {
    return validateRoomsPage(
      await this.request('GET', `/rooms${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  createRoom(input: {
    branchId: string;
    code: string;
    name: string;
    capacity?: number | undefined;
  }): Promise<O.OwnerRoom> {
    return this.request('POST', '/rooms', input);
  }
  updateRoom(
    id: string,
    input: {
      name?: string;
      capacity?: number;
      isActive?: boolean;
    },
    version: number,
  ): Promise<O.OwnerRoom> {
    return this.request('PATCH', `/rooms/${encodeURIComponent(id)}`, input, {
      'If-Match': String(version),
    });
  }
  async listTrainers(query: O.CatalogQuery = {}, options?: RequestOptions) {
    return validateTrainersPage(
      await this.request('GET', `/trainers${buildQuery(query)}`, undefined, undefined, options),
    );
  }
  getTrainer(id: string, options?: RequestOptions): Promise<O.OwnerTrainer> {
    return this.request(
      'GET',
      `/trainers/${encodeURIComponent(id)}`,
      undefined,
      undefined,
      options,
    );
  }
  createTrainer(input: {
    name?: string | undefined;
    biographyAr?: string | undefined;
    biographyEn?: string | undefined;
  }): Promise<O.OwnerTrainer> {
    return this.request('POST', '/trainers', input);
  }
  updateTrainer(
    id: string,
    input: {
      status?: 'ACTIVE' | 'INACTIVE';
      biographyAr?: string;
      biographyEn?: string;
    },
    version: number,
  ): Promise<O.OwnerTrainer> {
    return this.request('PATCH', `/trainers/${encodeURIComponent(id)}`, input, {
      'If-Match': String(version),
    });
  }
  createEnrollment(input: O.CreateEnrollmentInput): Promise<
    O.OwnerMutation & {
      state: string;
    }
  > {
    return this.request('POST', '/enrollments', input);
  }
  submitEnrollment(
    id: string,
    version: number,
  ): Promise<
    O.OwnerMutation & {
      state: string;
    }
  > {
    return this.enrollmentCommand(id, 'submit', undefined, version);
  }
  activateEnrollment(id: string, version: number, note?: string) {
    return this.enrollmentCommand(id, 'activate', note ? { note } : {}, version);
  }
  rejectEnrollment(id: string, reason: string, version: number) {
    return this.enrollmentCommand(id, 'reject', { reason }, version);
  }
  transferEnrollment(id: string, targetCohortId: string, reason: string, version: number) {
    return this.enrollmentCommand(id, 'transfer', { targetCohortId, reason }, version);
  }
  postponeEnrollment(id: string, reason: string, version: number) {
    return this.enrollmentCommand(id, 'postpone', { reason }, version);
  }
  resumeEnrollment(id: string, reason: string, version: number) {
    return this.enrollmentCommand(id, 'resume', { reason }, version);
  }
  completeEnrollment(id: string, reason: string, version: number) {
    return this.enrollmentCommand(id, 'complete', { reason }, version);
  }
  requestEnrollmentRetake(
    enrollmentId: string,
    programVersionModuleId: string,
    reason: string,
  ): Promise<{
    id: string;
    status: string;
    version: number;
  }> {
    return this.request('POST', `/enrollments/${encodeURIComponent(enrollmentId)}/retakes`, {
      programVersionModuleId,
      reason,
    });
  }
  requestEnrollmentCancellation(
    id: string,
    reason: string,
    version: number,
    idempotencyKey: string,
  ): Promise<{
    id: string;
    enrollmentId: string;
    status: string;
  }> {
    return this.request(
      'POST',
      `/enrollments/${encodeURIComponent(id)}/cancellation-requests`,
      { reason },
      { 'If-Match': String(version), 'Idempotency-Key': idempotencyKey },
    );
  }
  private enrollmentCommand(
    id: string,
    command: string,
    body: unknown,
    version: number,
  ): Promise<
    O.OwnerMutation & {
      state: string;
    }
  > {
    return this.request('POST', `/enrollments/${encodeURIComponent(id)}/${command}`, body, {
      'If-Match': String(version),
    });
  }
}
