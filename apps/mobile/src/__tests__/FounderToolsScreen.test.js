import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { FounderToolsScreen } from '../screens/FounderToolsScreen';

function makeProps(overrides = {}) {
  return {
    inviteCode: 'ABC123',
    groupName: 'Test Crew',
    onOpenSchedule: jest.fn(),
    onImportLineup: jest.fn(),
    lineupImportState: 'idle',
    lineupImportResult: null,
    ...overrides,
  };
}

describe('FounderToolsScreen — idle state', () => {
  it('renders group name and invite code', () => {
    const { getByText } = render(<FounderToolsScreen {...makeProps()} />);
    expect(getByText(/Test Crew/)).toBeTruthy();
    expect(getByText(/ABC123/)).toBeTruthy();
  });

  it('renders Upload Official Lineup button', () => {
    const { getByText } = render(<FounderToolsScreen {...makeProps()} />);
    expect(getByText('Upload Official Lineup')).toBeTruthy();
  });

  it('calls onImportLineup when Upload button is pressed', () => {
    const onImportLineup = jest.fn();
    const { getByText } = render(<FounderToolsScreen {...makeProps({ onImportLineup })} />);
    fireEvent.press(getByText('Upload Official Lineup'));
    expect(onImportLineup).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenSchedule when Open Group Schedule is pressed', () => {
    const onOpenSchedule = jest.fn();
    const { getByText } = render(<FounderToolsScreen {...makeProps({ onOpenSchedule })} />);
    fireEvent.press(getByText('Open Group Schedule'));
    expect(onOpenSchedule).toHaveBeenCalledTimes(1);
  });
});

describe('FounderToolsScreen — uploading state', () => {
  it('shows parsing message and disables the button', () => {
    const { getByText, queryByText } = render(
      <FounderToolsScreen {...makeProps({ lineupImportState: 'uploading' })} />
    );
    expect(getByText(/Parsing lineup/)).toBeTruthy();
    // Button is still rendered (just disabled), text stays Upload Official Lineup
    expect(getByText('Upload Official Lineup')).toBeTruthy();
    // Success message should not appear during upload
    expect(queryByText(/sets imported/)).toBeNull();
  });
});

describe('FounderToolsScreen — done state', () => {
  it('shows success message with set count', () => {
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 42, days_processed: ['Friday', 'Saturday'] },
        })}
      />
    );
    expect(getByText(/42 sets imported/)).toBeTruthy();
    expect(getByText(/Friday/)).toBeTruthy();
  });

  it('shows Re-upload button text when done', () => {
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 10, days_processed: ['Friday'] },
        })}
      />
    );
    expect(getByText('Re-upload to Add Missing Sets')).toBeTruthy();
  });

  it('still calls onImportLineup when Re-upload is pressed', () => {
    const onImportLineup = jest.fn();
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          onImportLineup,
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 5, days_processed: ['Friday'] },
        })}
      />
    );
    fireEvent.press(getByText('Re-upload to Add Missing Sets'));
    expect(onImportLineup).toHaveBeenCalledTimes(1);
  });
});
