import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { FounderToolsScreen } from '../screens/FounderToolsScreen';

jest.spyOn(Alert, 'alert').mockImplementation((_title, _msg, buttons) => {
  // Auto-press the "Delete" confirm button (index 1)
  buttons?.[1]?.onPress?.();
});

function makeProps(overrides = {}) {
  return {
    inviteCode: 'ABC123',
    groupName: 'Test Crew',
    onOpenSchedule: jest.fn(),
    onImportLineup: jest.fn(),
    onCopyInvite: jest.fn(),
    inviteCopied: false,
    lineupImportState: 'idle',
    lineupImportResult: null,
    officialLineupStats: null,
    onDeleteLineup: undefined,
    ...overrides,
  };
}

describe('FounderToolsScreen — layout', () => {
  it('has top padding in the scroll container', () => {
    const { UNSAFE_getByType } = render(<FounderToolsScreen {...makeProps()} />);
    const { ScrollView } = require('react-native');
    const scrollView = UNSAFE_getByType(ScrollView);
    expect(scrollView.props.contentContainerStyle).toMatchObject({ paddingTop: 12 });
  });
});

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

  it('does not render Open Group Schedule button', () => {
    const { queryByText } = render(<FounderToolsScreen {...makeProps()} />);
    expect(queryByText('Open Group Schedule')).toBeNull();
  });

  it('does not show Delete button when idle', () => {
    const { queryByText } = render(<FounderToolsScreen {...makeProps()} />);
    expect(queryByText('Delete All Official Sets')).toBeNull();
  });
});

describe('FounderToolsScreen — copy invite code', () => {
  it('calls onCopyInvite when the invite code row is pressed', () => {
    const onCopyInvite = jest.fn();
    const { getByTestId } = render(
      <FounderToolsScreen {...makeProps({ onCopyInvite, inviteCopied: false })} />
    );
    fireEvent.press(getByTestId('invite-copy-row'));
    expect(onCopyInvite).toHaveBeenCalledTimes(1);
  });

  it('shows copy icon when not yet copied', () => {
    const { getByText } = render(
      <FounderToolsScreen {...makeProps({ onCopyInvite: jest.fn(), inviteCopied: false })} />
    );
    expect(getByText('📋 Copy')).toBeTruthy();
  });

  it('shows copied confirmation text when inviteCopied is true', () => {
    const { getByText } = render(
      <FounderToolsScreen {...makeProps({ onCopyInvite: jest.fn(), inviteCopied: true })} />
    );
    expect(getByText('✓ Copied!')).toBeTruthy();
  });
});

describe('FounderToolsScreen — uploading state', () => {
  it('shows parsing message and disables the button', () => {
    const { getByText, queryByText } = render(
      <FounderToolsScreen {...makeProps({ lineupImportState: 'uploading' })} />
    );
    expect(getByText(/Parsing lineup.*keep the app open/s)).toBeTruthy();
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

  it('shows Delete All Official Sets button when done', () => {
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 10, days_processed: ['Friday'] },
          onDeleteLineup: jest.fn(),
        })}
      />
    );
    expect(getByText('Delete All Official Sets')).toBeTruthy();
  });

  it('calls onDeleteLineup after confirmation', () => {
    const onDeleteLineup = jest.fn();
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 10, days_processed: ['Friday'] },
          onDeleteLineup,
        })}
      />
    );
    fireEvent.press(getByText('Delete All Official Sets'));
    expect(onDeleteLineup).toHaveBeenCalledTimes(1);
  });
});

describe('FounderToolsScreen — persistent lineup stats', () => {
  it('shows stats block when officialLineupStats has sets and state is idle', () => {
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'idle',
          officialLineupStats: { set_count: 312, days: ['Friday', 'Saturday', 'Sunday'] },
        })}
      />
    );
    expect(getByText(/312 sets/)).toBeTruthy();
    expect(getByText(/Friday/)).toBeTruthy();
  });

  it('does not show stats block when set_count is 0', () => {
    const { queryByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'idle',
          officialLineupStats: { set_count: 0, days: [] },
        })}
      />
    );
    expect(queryByText(/\d+ sets/)).toBeNull();
  });

  it('does not show stats block when lineupImportState is done (success box shown instead)', () => {
    const { getByText, queryByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 10, days_processed: ['Friday'] },
          officialLineupStats: { set_count: 10, days: ['Friday'] },
        })}
      />
    );
    expect(getByText(/10 sets imported/)).toBeTruthy();
    // The persistent stats block should NOT appear (success box takes priority)
    expect(queryByText(/already imported/)).toBeNull();
  });

  it('shows delete button when officialLineupStats has sets even if state is idle', () => {
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'idle',
          officialLineupStats: { set_count: 50, days: ['Friday'] },
          onDeleteLineup: jest.fn(),
        })}
      />
    );
    expect(getByText('Delete All Official Sets')).toBeTruthy();
  });

  it('does not show delete button when no lineup exists and state is idle', () => {
    const { queryByText } = render(
      <FounderToolsScreen
        {...makeProps({
          lineupImportState: 'idle',
          officialLineupStats: { set_count: 0, days: [] },
          onDeleteLineup: jest.fn(),
        })}
      />
    );
    expect(queryByText('Delete All Official Sets')).toBeNull();
  });
});
