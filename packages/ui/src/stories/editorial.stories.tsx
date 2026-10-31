import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../button';
import { DataPanel, DetailPageShell, InlineStatus, LifecycleSpine } from '../editorial';

function EditorialRecordStory() {
  return (
    <div className="min-h-screen bg-workspace">
      <DetailPageShell
        actions={<Button size="small">Primary action</Button>}
        activeTab="overview"
        aside={
          <DataPanel density="compact">
            <h2 className="text-sm font-semibold">Record context</h2>
            <p className="mt-2 text-xs text-ink-muted">Permission-aware supporting facts.</p>
          </DataPanel>
        }
        breadcrumbs="Academy / Students / AO-2041"
        description="One durable operational record with its history, relationships and actions."
        lifecycle={
          <LifecycleSpine
            steps={[
              { id: 'lead', label: 'Lead', state: 'complete' },
              { id: 'registration', label: 'Registration', state: 'complete' },
              { id: 'enrollment', label: 'Enrollment', state: 'current' },
              { id: 'completion', label: 'Completion', state: 'upcoming' },
            ]}
          />
        }
        meta="AO-2041"
        status={<InlineStatus tone="success">Active learner</InlineStatus>}
        tabs={[
          { href: '#overview', id: 'overview', label: 'Overview' },
          { href: '#history', id: 'history', label: 'History' },
        ]}
        title="Mariam Hassan"
      >
        <DataPanel>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-muted">
            Operational overview
          </p>
          <h2 className="mt-1 text-lg font-semibold">Learning relationship</h2>
          <div className="mt-6 grid grid-cols-3 gap-6">
            <div>
              <p className="text-xs text-ink-muted">Enrollments</p>
              <p className="mt-1 text-2xl font-semibold">3</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Active</p>
              <p className="mt-1 text-2xl font-semibold">1</p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Completed</p>
              <p className="mt-1 text-2xl font-semibold">2</p>
            </div>
          </div>
        </DataPanel>
      </DetailPageShell>
    </div>
  );
}

const meta = { component: EditorialRecordStory, title: 'Editorial/Detail record' } satisfies Meta<
  typeof EditorialRecordStory
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
