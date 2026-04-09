import React from 'react';
import { render } from '@testing-library/react-native';
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
