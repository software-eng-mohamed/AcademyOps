import { academyPricingFixtures } from './academy-pricing-fixtures';
import { baseRecord, branchId, type DemoRecord, demoId, ownerId, timestamp } from './shared';

export function academyFixtures(): Record<string, DemoRecord[]> {
  const names = [
    'Leila Nassar',
    'Omar Selim',
    'Nour Adel',
    'Youssef Amin',
    'Maya Fares',
    'Adam Zaki',
    'Salma Hani',
    'Kareem Sami',
    'Hana Tarek',
    'Ziad Farid',
    'Dina Mostafa',
    'Ali Nabil',
  ];
  const programs = ['Full Stack Development', 'Product Design', 'Data Foundations'].map(
    (name, index) =>
      baseRecord(demoId(100 + index), {
        name,
        code: ['WEB', 'DESIGN', 'DATA'][index],
        status: 'ACTIVE',
      }),
  );
  const moduleNames = [
    'HTML & accessible interfaces',
    'React applications',
    'Node.js APIs',
    'Design research',
    'Interface systems',
    'Interactive prototypes',
    'Spreadsheets & SQL',
    'Python for analysis',
    'Data storytelling',
  ];
  const modules = moduleNames.map((name, index) =>
    baseRecord(demoId(120 + index), { name, code: `MOD-${index + 1}`, isActive: true }),
  );
  const programVersions = programs.map((program, index) =>
    baseRecord(demoId(110 + index), {
      programId: program.id,
      version: 1,
      recordVersion: 1,
      status: 'PUBLISHED',
      effectiveFrom: timestamp(-60).slice(0, 10),
      effectiveTo: null,
    }),
  );
  const programVersionModules = modules.map((module, index) =>
    baseRecord(demoId(500 + index), {
      programVersionId: demoId(110 + Math.floor(index / 3)),
      moduleId: module.id,
      ordinal: (index % 3) + 1,
      required: true,
    }),
  );
  const cohorts = [
    'Full Stack · Autumn 2026',
    'Product Design · Autumn 2026',
    'Data Foundations · Autumn 2026',
  ].map((name, index) =>
    baseRecord(demoId(150 + index), {
      name,
      code: `AUTUMN-${index + 1}`,
      programVersionId: demoId(110 + index),
      owningBranchId: branchId,
      status: 'ACTIVE',
      startsOn: timestamp(-30).slice(0, 10),
      endsOn: timestamp(60).slice(0, 10),
      capacity: 12,
      sourceSessionCount: 12,
      scheduledSessionCount: 12,
      scheduleConflictCount: 0,
      scheduleState: 'IN_PROGRESS',
      scheduleFirstAt: timestamp(-30),
      scheduleLastAt: timestamp(60),
      sourceAliases: [],
      capacitySource: 'MANUAL',
    }),
  );
  const cohortModules = programVersionModules.map((module, index) =>
    baseRecord(demoId(550 + index), {
      cohortId: demoId(150 + Math.floor(index / 3)),
      programVersionModuleId: module.id,
      moduleId: module.moduleId,
      ordinal: module.ordinal,
      required: true,
    }),
  );
  const students = names.map((name, index) => {
    const id = demoId(200 + index);
    const email = `${name.toLowerCase().replaceAll(' ', '.')}@example.invalid`;
    return baseRecord(id, {
      name,
      publicId: `AO-${1001 + index}`,
      branchId,
      birthDate: `${1998 + (index % 5)}-04-15`,
      gender: index % 2 ? 'MALE' : 'FEMALE',
      email,
      phone: null,
      legacyCode: null,
      contacts: [
        baseRecord(demoId(600 + index), {
          personId: id,
          type: 'EMAIL',
          rawValue: email,
          normalizedValue: email,
          isPrimary: true,
          verifiedAt: timestamp(-20),
        }),
      ],
      studentProfile: baseRecord(demoId(900 + index), { personId: id, portalStatus: 'ACTIVE' }),
    });
  });
  const enrollments = students.map((student, index) =>
    baseRecord(demoId(300 + index), {
      studentPersonId: student.id,
      programVersionId: demoId(110 + (index % 3)),
      cohortId: demoId(150 + (index % 3)),
      billingAccountId: demoId(2000 + index),
      homeBranchId: branchId,
      kind: 'INDIVIDUAL',
      state: index === 11 ? 'DRAFT' : 'ACTIVE',
      activatedAt: index === 11 ? null : timestamp(-25),
      completedAt: null,
      cancelledAt: null,
    }),
  );
  const leadStages = ['New enquiry', 'Consultation', 'Application', 'Ready to enroll'].map(
    (name, index) =>
      baseRecord(demoId(350 + index), {
        name,
        code: `STAGE-${index + 1}`,
        ordinal: index + 1,
        isActive: true,
      }),
  );
  const people = [
    'Rami Hassan',
    'Sara Khaled',
    'Mostafa Ashraf',
    'Jana Yassin',
    'Fady Younis',
    'Nada Kamal',
    'Malak Hossam',
    'Hady Fawzi',
  ].map((name, index) =>
    baseRecord(demoId(420 + index), {
      name,
      publicId: `AO-P${index + 1}`,
      email: `prospect${index + 1}@example.invalid`,
      contacts: [],
      birthDate: null,
      gender: null,
    }),
  );
  const leads = people.slice(0, 6).map((person, index) =>
    baseRecord(demoId(400 + index), {
      personId: person.id,
      state: ['NEW', 'OPEN', 'QUALIFIED', 'NEW', 'OPEN', 'LOST'][index],
      branchId,
      assignedUserId: index === 3 ? null : ownerId,
      stageId: demoId(350 + (index % 4)),
      source: ['Website', 'Open day', 'Referral'][index % 3],
      nextActionAt: timestamp(index - 1, 12),
      lostReason: index === 5 ? 'Schedule preference' : null,
    }),
  );
  const studentRegistrations = people.slice(6).map((person, index) =>
    baseRecord(demoId(450 + index), {
      personId: person.id,
      name: person.name,
      email: person.email,
      phone: null,
      birthDate: null,
      gender: null,
      branchId,
      status: 'PENDING',
      submittedAt: timestamp(-index - 1),
      reviewedAt: null,
      rejectionReason: null,
    }),
  );
  return {
    ...academyPricingFixtures(),
    programs,
    modules,
    programVersions,
    programVersionModules,
    cohorts,
    cohortModules,
    students,
    enrollments,
    leadStages,
    people,
    leads,
    studentRegistrations,
    rooms: ['Studio A', 'Studio B'].map((name, index) =>
      baseRecord(demoId(160 + index), {
        name,
        code: `ROOM-${index + 1}`,
        branchId,
        capacity: 24,
        isActive: true,
      }),
    ),
    trainers: ['Rana Khalil', 'Tamer Rami', 'Farah Emad'].map((name, index) =>
      baseRecord(demoId(170 + index), {
        name,
        personId: demoId(180 + index),
        person: { id: demoId(180 + index), name, publicId: `TRAINER-${index + 1}` },
        status: 'ACTIVE',
        biographyEn: 'An experienced practitioner leading hands-on learning sessions.',
        biographyAr: 'مدرب متخصص يقدم جلسات تعليمية عملية.',
      }),
    ),
    leadActivities: [],
    leadHistory: [],
    enrollmentEvents: [],
    enrollmentCancellationRequests: [],
    moduleRetakes: [],
  };
}
