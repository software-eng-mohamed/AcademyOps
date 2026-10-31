// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';
import { DatePicker } from './date-picker';
import { DateTimePicker } from './date-time-picker';
import { DetailPageShell, InlineStatus, LifecycleSpine } from './editorial';
import { Field } from './field';
import { Input } from './input';
import { MetricCard } from './metric-card';
import { PlgMotionProvider } from './motion-provider';
import { ProgressiveLoader } from './progressive-loader';
import { FormSelect } from './select';
import { Textarea } from './textarea';

describe('AcademyOps design-system foundations', () => {
  it('exposes a disabled, busy loading button with a meaningful label', () => {
    render(
      <Button loading loadingLabel="Saving payment">
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: /saving payment/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('automatically connects field help and validation errors to the input', () => {
    render(
      <Field
        description="Use your academy address."
        error="Email is required."
        htmlFor="email"
        label="Email"
      >
        <Input id="email" />
      </Field>,
    );
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('aria-describedby', 'email-description email-error');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('gives long-form text the same field semantics as other controls', () => {
    render(
      <Field error="Add a reason." htmlFor="reason" label="Reason">
        <Textarea id="reason" />
      </Field>,
    );
    const textarea = screen.getByLabelText('Reason');
    expect(textarea).toHaveAttribute('aria-describedby', 'reason-error');
    expect(textarea).toHaveAttribute('aria-invalid', 'true');
  });

  it('uses the shared calendar instead of the browser date popup', () => {
    const onValueChange = vi.fn();
    render(
      <Field htmlFor="starts-on" label="Starts on">
        <DatePicker id="starts-on" onValueChange={onValueChange} value="2026-08-22" />
      </Field>,
    );
    fireEvent.click(screen.getByLabelText('Starts on'));
    expect(screen.getByText('August 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sunday, August 23, 2026' }));
    expect(onValueChange).toHaveBeenCalledWith('2026-08-23');
  });

  it('keeps date and time together without a native datetime control', () => {
    const onValueChange = vi.fn();
    render(
      <Field htmlFor="next-session" label="Next session">
        <DateTimePicker id="next-session" onValueChange={onValueChange} value="2026-08-22T14:30" />
      </Field>,
    );
    fireEvent.click(screen.getByLabelText('Next session'));
    fireEvent.click(screen.getByRole('button', { name: 'Sunday, August 23, 2026' }));
    expect(onValueChange).toHaveBeenCalledWith('2026-08-23T14:30');
    expect(screen.getByLabelText('Time')).toBeInTheDocument();
  });

  it('renders legacy option children through the Radix-backed shared select', () => {
    const onChange = vi.fn();
    render(
      <Field htmlFor="status" label="Status">
        <FormSelect id="status" onChange={onChange} value="ACTIVE">
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </FormSelect>
      </Field>,
    );
    expect(screen.getByLabelText('Status')).toHaveTextContent('Active');
    expect(screen.getByRole('combobox', { name: 'Status' })).toBeInTheDocument();
  });

  it('keeps missing metric data distinct from a real zero', () => {
    const { rerender } = render(<MetricCard label="Outstanding" state="no-data" value={0} />);
    expect(screen.getByText('—')).toBeInTheDocument();
    rerender(<MetricCard label="Outstanding" value={0} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('exposes controlled loading progress and the current phase accessibly', () => {
    render(
      <PlgMotionProvider>
        <ProgressiveLoader phases={['Checking access', 'Loading records']} progress={75} />
      </PlgMotionProvider>,
    );
    expect(
      screen.getByRole('progressbar', { name: 'Loading AcademyOps workspace' }),
    ).toHaveAttribute('aria-valuenow', '75');
    expect(screen.getByText('Loading records')).toBeInTheDocument();
  });

  it('communicates the current lifecycle step and active detail tab', () => {
    render(
      <DetailPageShell
        activeTab="history"
        lifecycle={
          <LifecycleSpine
            steps={[
              { id: 'registration', label: 'Registration', state: 'complete' },
              { id: 'enrollment', label: 'Enrollment', state: 'current' },
            ]}
          />
        }
        status={<InlineStatus tone="success">Active</InlineStatus>}
        tabs={[
          { href: '#overview', id: 'overview', label: 'Overview' },
          { href: '#history', id: 'history', label: 'History' },
        ]}
        title="Student record"
      >
        Record content
      </DetailPageShell>,
    );
    expect(screen.getByRole('list', { name: 'Record lifecycle' })).toBeInTheDocument();
    expect(screen.getByText('Enrollment').closest('li')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('link', { name: 'History' })).toHaveAttribute('aria-current', 'page');
  });
});
