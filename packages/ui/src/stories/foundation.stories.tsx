import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Button } from '../button';
import { Card, CardContent, CardHeader, CardTitle } from '../card';
import { DatePicker } from '../date-picker';
import { DateTimePicker } from '../date-time-picker';
import { Skeleton, StatePanel } from '../feedback';
import { Field } from '../field';
import { Input } from '../input';
import { Select } from '../select';
import { Textarea } from '../textarea';

function FoundationStory() {
  return (
    <div className="grid w-[min(92vw,48rem)] gap-4 rounded-xl bg-white p-6">
      <div className="flex flex-wrap gap-2">
        <Button>Save changes</Button>
        <Button variant="secondary">Cancel</Button>
        <Button variant="tertiary">View details</Button>
        <Button variant="destructive">Remove access</Button>
        <Button loading loadingLabel="Saving">
          Save
        </Button>
      </div>
      <Field description="Used for academy notices." htmlFor="email" label="Work email">
        <Input id="email" type="email" defaultValue="owner@academyops.example" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Card density="compact">
          <CardHeader>
            <CardTitle>Compact surface</CardTitle>
          </CardHeader>
          <CardContent>Quiet analytical content.</CardContent>
        </Card>
        <Skeleton className="h-24" />
      </div>
      <StatePanel
        title="No sessions scheduled"
        description="The academy calendar is clear for this scope."
      />
    </div>
  );
}

function FormControlsStory() {
  const [program, setProgram] = useState<string | null>(null);
  const [startsOn, setStartsOn] = useState('2026-08-22');
  const [endsOn, setEndsOn] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('2026-08-24T14:30');

  return (
    <div className="grid w-[min(92vw,32rem)] gap-5 rounded-xl border border-border bg-white p-6 shadow-[var(--plg-shadow-card)]">
      <div>
        <h2 className="text-base font-semibold text-ink">Cohort planning</h2>
        <p className="mt-1 text-xs text-ink-muted">
          AcademyOps controls with consistent focus and overlay behavior.
        </p>
      </div>
      <Field htmlFor="story-follow-up" label="Next follow-up">
        <DateTimePicker id="story-follow-up" onValueChange={setNextFollowUp} value={nextFollowUp} />
      </Field>
      <Field htmlFor="story-program" label="Published program version">
        <Select
          className="w-full"
          id="story-program"
          onValueChange={setProgram}
          options={[
            { label: 'HR-DIPLOMA · v1', value: 'hr-v1' },
            { label: 'SALES-FOUNDATIONS · v3', value: 'sales-v3' },
          ]}
          placeholder="Select a version"
          value={program}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field htmlFor="story-start" label="Starts on">
          <DatePicker id="story-start" onValueChange={setStartsOn} value={startsOn} />
        </Field>
        <Field htmlFor="story-end" label="Ends on">
          <DatePicker id="story-end" min={startsOn} onValueChange={setEndsOn} value={endsOn} />
        </Field>
      </div>
      <Field
        description="This note is included in the enrollment audit trail."
        htmlFor="story-reason"
        label="Transfer reason"
      >
        <Textarea id="story-reason" placeholder="Explain why the student is moving cohorts" />
      </Field>
    </div>
  );
}

const meta = { component: FoundationStory, title: 'Foundation/Overview' } satisfies Meta<
  typeof FoundationStory
>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const FormControls: Story = { render: () => <FormControlsStory /> };
