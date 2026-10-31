import { executeCatalogCommand } from './catalog-commands';
import { executeCohortResourceCommand } from './cohort-resource-commands';
import { type AcademyCommandInput, createCommandContext } from './command-context';
import { executeEnrollmentCommand } from './enrollment-commands';
import { executeLeadStudentCommand } from './lead-student-commands';

export async function executeAcademyAction(input: AcademyCommandInput): Promise<unknown> {
  const context = createCommandContext(input);
  switch (input.target.resource) {
    case 'leads':
    case 'students':
    case 'registrations':
      return executeLeadStudentCommand(context);
    case 'enrollments':
      return executeEnrollmentCommand(context);
    case 'programs':
    case 'versions':
    case 'modules':
      return executeCatalogCommand(context);
    case 'cohorts':
    case 'rooms':
    case 'trainers':
    case 'stages':
      return executeCohortResourceCommand(context);
    default:
      throw new Error('Unsupported academy command');
  }
}
