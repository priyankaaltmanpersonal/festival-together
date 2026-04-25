import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { IndividualSchedulesScreen } from '../screens/IndividualSchedulesScreen';

function makeProps(overrides = {}) {
  return {
    individualSnapshot: null,
    festivalDays: [{ dayIndex: 1, label: 'Friday' }],
    onLoadIndividual: jest.fn(),
    onBack: jest.fn(),
    ...overrides,
  };
}

describe('IndividualSchedulesScreen — preference display', () => {
  it('displays "Maybe" for flexible preference', () => {
    const snapshot = {
      members: [
        {
          member_id: 'mem-1',
          display_name: 'Alice',
          setup_status: 'done',
          sets: [
            {
              canonical_set_id: 'set-1',
              artist_name: 'Bad Bunny',
              stage_name: 'Sahara',
              start_time_pt: '21:00',
              end_time_pt: '22:00',
              day_index: 1,
              preference: 'flexible',
            },
          ],
        },
      ],
    };
    const { getByText } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: snapshot })} />
    );
    expect(getByText(/Maybe/)).toBeTruthy();
  });

  it('displays "Definitely" for must_see preference', () => {
    const snapshot = {
      members: [
        {
          member_id: 'mem-1',
          display_name: 'Alice',
          setup_status: 'done',
          sets: [
            {
              canonical_set_id: 'set-2',
              artist_name: 'Peso Pluma',
              stage_name: 'Coachella Stage',
              start_time_pt: '22:00',
              end_time_pt: '23:00',
              day_index: 1,
              preference: 'must_see',
            },
          ],
        },
      ],
    };
    const { getByText } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: snapshot })} />
    );
    expect(getByText(/Definitely/)).toBeTruthy();
  });

  it('does not show raw preference values like "flexible" or "must_see"', () => {
    const snapshot = {
      members: [
        {
          member_id: 'mem-1',
          display_name: 'Alice',
          setup_status: 'done',
          sets: [
            {
              canonical_set_id: 'set-1',
              artist_name: 'Bad Bunny',
              stage_name: 'Sahara',
              start_time_pt: '21:00',
              end_time_pt: '22:00',
              day_index: 1,
              preference: 'flexible',
            },
            {
              canonical_set_id: 'set-2',
              artist_name: 'Peso Pluma',
              stage_name: 'Coachella Stage',
              start_time_pt: '22:00',
              end_time_pt: '23:00',
              day_index: 1,
              preference: 'must_see',
            },
          ],
        },
      ],
    };
    const { queryByText } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: snapshot })} />
    );
    expect(queryByText(/\bflexible\b/)).toBeNull();
    expect(queryByText(/\bmust_see\b/)).toBeNull();
  });
});

describe('IndividualSchedulesScreen — preference badge styling', () => {
  const makeSnapshot = (preference) => ({
    members: [{
      member_id: 'mem-1',
      display_name: 'Alice',
      setup_status: 'done',
      sets: [{
        canonical_set_id: 'set-1',
        artist_name: 'Test Artist',
        stage_name: 'Sahara',
        start_time_pt: '21:00',
        end_time_pt: '22:00',
        day_index: 1,
        preference,
      }],
    }],
  });

  it('renders a green Definitely badge for must_see sets', () => {
    const { getByTestId } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: makeSnapshot('must_see') })} />
    );
    const badge = getByTestId('preference-badge');
    expect(badge.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'rgba(22,163,74,0.15)' })])
    );
  });

  it('renders an amber Maybe badge for flexible sets', () => {
    const { getByTestId } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: makeSnapshot('flexible') })} />
    );
    const badge = getByTestId('preference-badge');
    expect(badge.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ backgroundColor: 'rgba(245,158,11,0.15)' })])
    );
  });

  it('handles null preference gracefully (renders Maybe badge)', () => {
    const { getByTestId } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: makeSnapshot(null) })} />
    );
    expect(getByTestId('preference-badge')).toBeTruthy();
  });

  it('preference text is not shown inline in the stage/time line', () => {
    const { queryByText } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: makeSnapshot('must_see') })} />
    );
    expect(queryByText(/• Definitely/)).toBeNull();
    expect(queryByText(/• Maybe/)).toBeNull();
  });
});

describe('IndividualSchedulesScreen — expand/collapse all', () => {
  const snapshot = {
    members: [
      {
        member_id: 'mem-1',
        display_name: 'Alice',
        setup_status: 'done',
        sets: [{
          canonical_set_id: 'set-1',
          artist_name: 'Alice Artist',
          stage_name: 'Sahara',
          start_time_pt: '21:00',
          end_time_pt: '22:00',
          day_index: 1,
          preference: 'must_see',
        }],
      },
      {
        member_id: 'mem-2',
        display_name: 'Priyanka',
        setup_status: 'done',
        sets: [{
          canonical_set_id: 'set-2',
          artist_name: 'Priyanka Artist',
          stage_name: 'Gobi',
          start_time_pt: '20:00',
          end_time_pt: '21:00',
          day_index: 1,
          preference: 'flexible',
        }],
      },
    ],
  };

  it('collapses and expands all visible member schedules', () => {
    const { getByText, queryByText } = render(
      <IndividualSchedulesScreen {...makeProps({ individualSnapshot: snapshot })} />
    );

    expect(getByText('Alice Artist')).toBeTruthy();
    expect(getByText('Priyanka Artist')).toBeTruthy();

    fireEvent.press(getByText('Collapse all'));
    expect(queryByText('Alice Artist')).toBeNull();
    expect(queryByText('Priyanka Artist')).toBeNull();

    fireEvent.press(getByText('Expand all'));
    expect(getByText('Alice Artist')).toBeTruthy();
    expect(getByText('Priyanka Artist')).toBeTruthy();
  });
});
