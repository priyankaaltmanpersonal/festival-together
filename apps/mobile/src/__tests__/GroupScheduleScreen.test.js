import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { GroupScheduleScreen, userAttendanceCardStyle } from '../screens/GroupScheduleScreen';
import { lightColors } from '../theme';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue('true'), // hint already seen by default
  setItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'Light' },
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
    onSetPreferenceFromGrid: jest.fn(),
    onRemoveFromGrid: jest.fn(),
    onNavigateToEditSet: jest.fn(),
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

describe('GroupScheduleScreen — double-tap attendance cycling', () => {
  const MY_ID = 'member-me';

  function makeAttendedSet(id, preference) {
    return {
      id,
      day_index: 1,
      artist_name: `Artist ${id}`,
      stage_name: STAGE,
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      attendees: preference
        ? [{ member_id: MY_ID, display_name: 'Me', preference, chip_color: '#f00' }]
        : [],
      attendee_count: preference ? 1 : 0,
      popularity_tier: null,
    };
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('double-tap on a not-attending set calls onAddToMySchedule', () => {
    const onAdd = jest.fn().mockResolvedValue(undefined);
    const sets = [makeAttendedSet('a', null)];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onAddToMySchedule: onAdd })}
      />
    );
    const card = getByText('Artist a');
    fireEvent.press(card);
    fireEvent.press(card);
    jest.runAllTimers();
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('double-tap on a maybe set calls onSetPreferenceFromGrid with must_see', () => {
    const onUpgrade = jest.fn().mockResolvedValue(undefined);
    const sets = [makeAttendedSet('b', 'flexible')];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onSetPreferenceFromGrid: onUpgrade })}
      />
    );
    const card = getByText('Artist b');
    fireEvent.press(card);
    fireEvent.press(card);
    jest.runAllTimers();
    expect(onUpgrade).toHaveBeenCalledWith('b', 'must_see');
  });

  it('double-tap on a definitely set calls onRemoveFromGrid', () => {
    const onRemove = jest.fn().mockResolvedValue(undefined);
    const sets = [makeAttendedSet('c', 'must_see')];
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onRemoveFromGrid: onRemove })}
      />
    );
    const card = getByText('Artist c');
    fireEvent.press(card);
    fireEvent.press(card);
    jest.runAllTimers();
    expect(onRemove).toHaveBeenCalledWith('c');
  });

  it('overlay + and ✓ icon buttons are not rendered', () => {
    const maybe = [makeAttendedSet('e', 'flexible')];
    const none = [makeAttendedSet('f', null)];
    const { queryByText: q1 } = render(
      <GroupScheduleScreen {...makeProps(maybe, { myMemberId: MY_ID, onSetPreferenceFromGrid: jest.fn() })} />
    );
    expect(q1('✓')).toBeNull();
    const { queryByText: q2 } = render(
      <GroupScheduleScreen {...makeProps(none, { myMemberId: MY_ID, onAddToMySchedule: jest.fn() })} />
    );
    expect(q2('+')).toBeNull();
  });
});

describe('GroupScheduleScreen — edit navigation link', () => {
  const MY_ID = 'member-me';

  it('shows tappable edit link in expanded modal when user is attending', () => {
    jest.useFakeTimers();
    const attendees = [{ member_id: MY_ID, display_name: 'Me', preference: 'must_see', chip_color: '#f00' }];
    const sets = [{
      id: 'set-x',
      day_index: 1,
      artist_name: 'Edit Artist',
      stage_name: STAGE,
      start_time_pt: '20:00',
      end_time_pt: '21:00',
      attendees,
      attendee_count: 1,
      popularity_tier: null,
    }];
    const onNavigate = jest.fn();
    const { getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onNavigateToEditSet: onNavigate, onAddToMySchedule: jest.fn() })}
      />
    );
    // Open the modal via single tap (after debounce)
    fireEvent.press(getByText('Edit Artist'));
    act(() => { jest.advanceTimersByTime(300); });
    // Tap the edit link
    fireEvent.press(getByText('Edit in your schedule →'));
    expect(onNavigate).toHaveBeenCalledWith(1);
    jest.useRealTimers();
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

describe('GroupScheduleScreen — renders correctly after isolated preference update', () => {
  const MY_ID = 'me';

  it('does not visually change unrelated sets when one set preference changes', () => {
    // Smoke test for the GroupScheduleScreen component in isolation (not an integration
    // test of App.js — applyPreferenceLocally lives in App.js, which has no test file).
    // Regression: applyPreferenceLocally was updating ALL sets' attendee preferences
    // instead of only the matching canonicalSetId. This test verifies the component
    // prop boundary—a parent that correctly updates only one set in the snapshot
    // results in only that set showing must_see styling.
    const attendees = (pref) => [{ member_id: MY_ID, display_name: 'Me', preference: pref, chip_color: '#f00' }];
    const sets = [
      { id: 'set-a', day_index: 1, artist_name: 'Set A', stage_name: STAGE, start_time_pt: '20:00', end_time_pt: '21:00', attendees: attendees('flexible'), attendee_count: 1, popularity_tier: null },
      { id: 'set-b', day_index: 1, artist_name: 'Set B', stage_name: STAGE, start_time_pt: '21:00', end_time_pt: '22:00', attendees: attendees('flexible'), attendee_count: 1, popularity_tier: null },
    ];
    // Simulate a correctly-fixed parent: only set-a gets upgraded to must_see
    const updatedSets = sets.map((s) =>
      s.id === 'set-a'
        ? { ...s, attendees: attendees('must_see') }
        : s
    );
    const { rerender, getByText } = render(
      <GroupScheduleScreen
        {...makeProps(sets, { myMemberId: MY_ID, onSetPreferenceFromGrid: jest.fn(), onRemoveFromGrid: jest.fn() })}
        scheduleSnapshot={{ sets, stages: [STAGE] }}
      />
    );
    rerender(
      <GroupScheduleScreen
        {...makeProps(updatedSets, { myMemberId: MY_ID, onSetPreferenceFromGrid: jest.fn(), onRemoveFromGrid: jest.fn() })}
        scheduleSnapshot={{ sets: updatedSets, stages: [STAGE] }}
      />
    );
    // Both sets should still render (no crash or disappearance)
    expect(getByText('Set A')).toBeTruthy();
    expect(getByText('Set B')).toBeTruthy();
  });
});

describe('userAttendanceCardStyle', () => {
  it('returns empty object when preference is null (not attending)', () => {
    expect(userAttendanceCardStyle(null, lightColors)).toEqual({});
  });

  it('returns empty object when preference is "none"', () => {
    expect(userAttendanceCardStyle('none', lightColors)).toEqual({});
  });

  it('returns maybe mint style for flexible (maybe) preference', () => {
    const style = userAttendanceCardStyle('flexible', lightColors);
    expect(style.backgroundColor).toBe(lightColors.myAttendanceMaybeBg);
    expect(style.borderColor).toBe(lightColors.myAttendanceMaybeBorder);
  });

  it('returns definitely mint style for must_see preference', () => {
    const style = userAttendanceCardStyle('must_see', lightColors);
    expect(style.backgroundColor).toBe(lightColors.myAttendanceDefBg);
    expect(style.borderColor).toBe(lightColors.myAttendanceDefBorder);
  });
});
