import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { GroupScheduleScreen } from '../screens/GroupScheduleScreen';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

const STAGE = 'Sahara';

function makeSet(id, dayIndex, artistName, startTime = '21:00', endTime = '22:00') {
  return {
    id,
    day_index: dayIndex,
    artist_name: artistName,
    stage_name: STAGE,
    start_time_pt: startTime,
    end_time_pt: endTime,
    attendees: [],
    attendee_count: 0,
    popularity_tier: null,
  };
}

function makeProps(sets, overrides = {}) {
  return {
    homeSnapshot: { members: [] },
    scheduleSnapshot: { sets, stages: [STAGE] },
    selectedMemberIds: [],
    loading: false,
    onToggleMember: jest.fn(),
    onResetFilters: jest.fn(),
    inviteCode: null,
    onCopyInvite: jest.fn(),
    inviteCopied: false,
    myMemberId: null,
    onAddToMySchedule: null,
    festivalDays: [
      { dayIndex: 1, label: 'Friday' },
      { dayIndex: 2, label: 'Saturday' },
    ],
    ...overrides,
  };
}

describe('GroupScheduleScreen — day filtering', () => {
  it('shows only Day 1 sets by default (first available day)', () => {
    const sets = [
      makeSet('a', 1, 'Artist Day1'),
      makeSet('b', 2, 'Artist Day2'),
    ];
    const { getByText, queryByText } = render(<GroupScheduleScreen {...makeProps(sets)} />);

    expect(getByText('Artist Day1')).toBeTruthy();
    expect(queryByText('Artist Day2')).toBeNull();
  });

  it('switches to Day 2 when Day 2 tab is selected', () => {
    const sets = [
      makeSet('a', 1, 'Artist Day1'),
      makeSet('b', 2, 'Artist Day2'),
    ];
    const { getByText, queryByText } = render(<GroupScheduleScreen {...makeProps(sets)} />);

    fireEvent.press(getByText('Saturday'));

    expect(queryByText('Artist Day1')).toBeNull();
    expect(getByText('Artist Day2')).toBeTruthy();
  });

  it('derives availableDays as sorted unique day_index values', () => {
    const sets = [
      makeSet('a', 2, 'A'),
      makeSet('b', 1, 'B'),
      makeSet('c', 2, 'C'),
      makeSet('d', 3, 'D'),
    ];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, {
          festivalDays: [
            { dayIndex: 1, label: 'Fri' },
            { dayIndex: 2, label: 'Sat' },
            { dayIndex: 3, label: 'Sun' },
          ],
        })}
      />
    );
    expect(getByText('Fri')).toBeTruthy();
    expect(getByText('Sat')).toBeTruthy();
    expect(getByText('Sun')).toBeTruthy();
  });

  it('shows no day selector when all sets share one day_index', () => {
    const sets = [makeSet('a', 1, 'A'), makeSet('b', 1, 'B')];
    const { queryByText } = render(<GroupScheduleScreen {...makeProps(sets)} />);
    expect(queryByText('Saturday')).toBeNull();
  });

  it('shows "No schedule loaded yet" when sets array is empty', () => {
    const { getByText } = render(<GroupScheduleScreen {...makeProps([])} />);
    expect(getByText('No schedule loaded yet.')).toBeTruthy();
  });
});

describe('GroupScheduleScreen — quick-add icons', () => {
  const MY_ID = 'member-me';

  function makeSetWithAttendees(id, attendees = []) {
    return {
      id,
      day_index: 1,
      artist_name: `Artist ${id}`,
      stage_name: STAGE,
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      attendees,
      attendee_count: attendees.length,
      popularity_tier: null,
    };
  }

  it('shows + icon when user is not attending the set', () => {
    const sets = [makeSetWithAttendees('a', [])];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onAddToMySchedule: jest.fn() })}
      />
    );
    expect(getByText('+')).toBeTruthy();
  });

  it('calls onAddToMySchedule when + icon is tapped', () => {
    const onAdd = jest.fn().mockResolvedValue(undefined);
    const sets = [makeSetWithAttendees('a', [])];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onAddToMySchedule: onAdd })}
      />
    );
    fireEvent.press(getByText('+'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('shows ✓ icon when user is a maybe for the set', () => {
    const attendees = [{ member_id: MY_ID, display_name: 'Me', preference: 'flexible', chip_color: '#f00' }];
    const sets = [makeSetWithAttendees('b', attendees)];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onSetPreferenceFromGrid: jest.fn() })}
      />
    );
    expect(getByText('✓')).toBeTruthy();
  });

  it('calls onSetPreferenceFromGrid with must_see when ✓ icon is tapped', () => {
    const onUpgrade = jest.fn().mockResolvedValue(undefined);
    const attendees = [{ member_id: MY_ID, display_name: 'Me', preference: 'flexible', chip_color: '#f00' }];
    const sets = [makeSetWithAttendees('b', attendees)];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onSetPreferenceFromGrid: onUpgrade })}
      />
    );
    fireEvent.press(getByText('✓'));
    expect(onUpgrade).toHaveBeenCalledWith('b', 'must_see');
  });

  it('shows no quick-add icon when user is definitely attending', () => {
    const attendees = [{ member_id: MY_ID, display_name: 'Me', preference: 'must_see', chip_color: '#f00' }];
    const sets = [makeSetWithAttendees('c', attendees)];
    const { queryByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onAddToMySchedule: jest.fn(), onSetPreferenceFromGrid: jest.fn() })}
      />
    );
    expect(queryByText('+')).toBeNull();
    expect(queryByText('✓')).toBeNull();
  });

  it('shows no icons when myMemberId is null', () => {
    const sets = [makeSetWithAttendees('d', [])];
    const { queryByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: null, onAddToMySchedule: jest.fn() })}
      />
    );
    expect(queryByText('+')).toBeNull();
  });
});

describe('GroupScheduleScreen — hide-unattended toggle', () => {
  it('filters out sets with attendee_count 0 when toggle is active', () => {
    const sets = [
      {
        id: 'set-1',
        artist_name: 'Attended Artist',
        stage_name: STAGE,
        start_time_pt: '20:00',
        end_time_pt: '21:00',
        day_index: 1,
        attendee_count: 1,
        attendees: [{ member_id: 'me', display_name: 'Me', preference: 'must_see', chip_color: '#f00' }],
        popularity_tier: 'low',
      },
      {
        id: 'set-2',
        artist_name: 'Unattended Artist',
        stage_name: STAGE,
        start_time_pt: '21:30',
        end_time_pt: '22:30',
        day_index: 1,
        attendee_count: 0,
        attendees: [],
        popularity_tier: 'none',
      },
    ];
    const { getByText, queryByText } = render(<GroupScheduleScreen {...makeProps(sets)} />);

    // Both visible before toggle
    expect(getByText('Attended Artist')).toBeTruthy();
    expect(getByText('Unattended Artist')).toBeTruthy();

    // Tap the "Group only" toggle
    fireEvent.press(getByText('Group only'));

    // Unattended now hidden
    expect(getByText('Attended Artist')).toBeTruthy();
    expect(queryByText('Unattended Artist')).toBeNull();

    // Tap again to disable toggle
    fireEvent.press(getByText('Group only'));
    expect(getByText('Unattended Artist')).toBeTruthy();
  });
});
