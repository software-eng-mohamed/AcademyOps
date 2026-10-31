import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Select, SelectItem } from '@/components/base/select/select';

afterEach(() => {
  cleanup();
});

describe('Select Component', () => {
  it('opens and selects an item without crashing', async () => {
    render(
      <Select aria-label="Test Select" defaultSelectedKey="one">
        <SelectItem id="one" textValue="Option One">
          Option One
        </SelectItem>
        <SelectItem id="two" textValue="Option Two">
          Option Two
        </SelectItem>
      </Select>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDefined();

    fireEvent.click(button);

    const optionTwo = await screen.findByRole('option', { name: 'Option Two' });
    expect(optionTwo).toBeDefined();

    fireEvent.click(optionTwo);
  });

  it('works when SelectItem has no textValue and children is text', async () => {
    render(
      <Select aria-label="No textValue" defaultSelectedKey="one">
        <SelectItem id="one">Option One</SelectItem>
        <SelectItem id="two">Option Two</SelectItem>
      </Select>,
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);
    const optionTwo = await screen.findByRole('option', { name: 'Option Two' });
    fireEvent.click(optionTwo);
    expect(screen.getByRole('button')).toHaveTextContent('Option Two');
  });

  it('works with external label using id or triggerId', async () => {
    render(
      <div>
        <label htmlFor="test-select-id">Select Label</label>
        <Select id="test-select-id" aria-label="Labelled Select" defaultSelectedKey="one">
          <SelectItem id="one">Option One</SelectItem>
          <SelectItem id="two">Option Two</SelectItem>
        </Select>
      </div>,
    );

    const label = screen.getByText('Select Label');
    fireEvent.click(label);
    const button = screen.getByRole('button');
    expect(button.id).toBe('test-select-id');
  });

  it('handles being inside an overlay modal content', async () => {
    render(
      <div data-plg-overlay-content="modal" style={{ overflow: 'hidden', height: '200px' }}>
        <Select aria-label="Modal Select" defaultSelectedKey="one">
          <SelectItem id="one">Option One</SelectItem>
          <SelectItem id="two">Option Two</SelectItem>
        </Select>
      </div>,
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);
    const optionTwo = await screen.findByRole('option', { name: 'Option Two' });
    expect(optionTwo).toBeDefined();
    fireEvent.click(optionTwo);
  });
});
