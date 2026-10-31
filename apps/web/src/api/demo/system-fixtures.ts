import {
  baseRecord,
  type DemoRecord,
  type DemoState,
  demoId,
  object,
  ownerId,
  records,
  timestamp,
} from './shared';

export function systemFixtures(state: DemoState): Record<string, DemoRecord[]> {
  const rules = records(state, 'programVersions').map((version, index) =>
    baseRecord(demoId(4100 + index), {
      programVersionId: version.id,
      cohortId: null,
      minimumRatio: '0.8000',
      effectiveFrom: timestamp(-90),
      effectiveTo: null,
      createdBy: ownerId,
    }),
  );
  const certificateState = {
    ...state,
    collections: { ...state.collections, certificateRules: rules },
  };
  const certificates = records(state, 'enrollments')
    .slice(0, 2)
    .map((enrollment, index) => {
      const snapshot = certificateEligibility(certificateState, enrollment);
      if (!snapshot) throw new Error('The sample certificate needs a matching rule.');
      const evaluation = certificateEvaluation(enrollment.id, demoId(4200 + index), snapshot);
      const certificate = certificateRecord(
        certificateState,
        enrollment,
        evaluation,
        demoId(4300 + index),
        `DEMO-CERT-${1001 + index}`,
      );
      certificate.fulfillmentStatus = index ? 'PRINTED' : 'NOT_PRINTED';
      certificate.events = [
        baseRecord(demoId(4450 + index), {
          certificateId: certificate.id,
          type: 'ISSUED',
          fromValue: null,
          toValue: 'ISSUED',
          actorUserId: ownerId,
          reason: 'Fictional portfolio sample',
          occurredAt: timestamp(),
        }),
      ];
      return certificate;
    });
  const imports = ['VALIDATED', 'FINALIZED'].map((status, index) =>
    baseRecord(demoId(4500 + index), {
      status,
      receivedAt: timestamp(-5 - index),
      receivedBy: ownerId,
      sourceSha256: 'a'.repeat(64),
      finalizedAt: index ? timestamp(-3) : null,
      finalizedBy: index ? ownerId : null,
      openIssues: 0,
      dispositions: { READY: index ? 0 : 12, PROMOTED: index ? 12 : 0 },
      reconciliation: [],
      sources: [
        baseRecord(demoId(4510 + index), {
          batchId: demoId(4500 + index),
          originalName: index ? 'sample-summer-enrollments.xlsx' : 'sample-autumn-enrollments.xlsx',
          sizeBytes: '4096',
          sha256: 'a'.repeat(64),
          storedPath: null,
          workbookMeta: { sheets: ['Students'], synthetic: true },
        }),
      ],
    }),
  );
  const roles = [
    ...records(state, 'roles'),
    baseRecord(demoId(3002), {
      code: 'OPERATIONS',
      name: 'Operations',
      isSystem: true,
      grants: [
        { permissionCode: 'students.read_basic', scope: 'O' },
        { permissionCode: 'academic.sessions.manage', scope: 'O' },
      ],
    }),
  ];
  return {
    roles,
    certificates,
    certificateRules: rules,
    imports,
    importIssues: [],
    certificateEvaluations: certificates.map((item) => object(item.evaluation) as DemoRecord),
    legacyArchive: [
      baseRecord(demoId(4600), {
        batchId: imports[1]?.id,
        category: 'STUDENT',
        sourceFileId: demoId(4511),
        sourceFileName: 'sample-summer-enrollments.xlsx',
        sheetName: 'Students',
        rowNumber: 2,
        dataHash: 'b'.repeat(64),
        data: {
          name: 'Sample Former Learner',
          program: 'Web Foundations',
          note: 'Fictional archive record',
        },
      }),
    ],
  };
}

import { certificateRecord } from './certificate-commands';
import { certificateEligibility, certificateEvaluation } from './certificate-eligibility';
