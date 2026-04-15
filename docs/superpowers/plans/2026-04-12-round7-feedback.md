# Round 7 Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement seven UX improvements: festival days helper text, founder onboarding "Upload Official Schedule" step, member "Schedule is Ready" intro screen, back/start-over navigation on every onboarding step, full backend reset, skip-day spinner fix, and FounderTools partial-failure warning.

**Architecture:** All changes are isolated to three files (`SetupScreen.js`, `FounderToolsScreen.js`, `App.js`) plus their test files. UI components receive new props from App.js; App.js wires state + handlers. No new files needed.

**Tech Stack:** React Native / Expo, Jest + @testing-library/react-native, existing `apiRequest` / `uploadImages` / `pickImages` helpers.

---

## File Map

| File | Changes |
|---|---|
| `apps/mobile/src/screens/SetupScreen.js` | New props, `upload_official_schedule` step, `member_lineup_intro` step, back nav on all upload steps, `StartOverLink` component, updated error display |
| `apps/mobile/src/screens/FounderToolsScreen.js` | Add `festivalDays` prop, `missingDays` memo, amber warning JSX + styles |
| `apps/mobile/App.js` | New state variables, persistence, handlers, step transitions, props wiring, `resetFlow` fix, `allDaysReady` fix |
| `apps/mobile/src/__tests__/SetupScreen.test.js` | New test describes for all new steps; updated `makeProps`; back-nav tests |
| `apps/mobile/src/__tests__/FounderToolsScreen.test.js` | New partial-failure describe; `festivalDays` added to `makeProps` |

---

## Task 1: Festival Days Helper Text

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js:123`
- Test: `apps/mobile/src/__tests__/SetupScreen.test.js`

- [ ] **Step 1: Write the failing test**

Add a new describe block at the bottom of `SetupScreen.test.js`, before the final closing line:

```js
describe('SetupScreen — festival_setup step', () => {
  it('helper text includes example day names', () => {
    const { getByText } = render(
      <SetupScreen {...makeProps({ onboardingStep: 'festival_setup' })} />
    );
    expect(getByText(/e\.g\. "Friday", "Saturday", "Sunday"/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
cd apps/mobile && npm test -- --testPathPattern=SetupScreen --passWithNoTests
```

Expected: FAIL — `Unable to find an element with text matching /e\.g\. "Friday"/`

- [ ] **Step 3: Update helper text in SetupScreen.js**

In `apps/mobile/src/screens/SetupScreen.js`, line 123, change:

```js
          <Text style={styles.helper}>Add each day of the festival you're attending.</Text>
```

to:

```js
          <Text style={styles.helper}>Add each day of the festival you're attending (e.g. "Friday", "Saturday", "Sunday").</Text>
```

- [ ] **Step 4: Run tests to verify passing**

```
cd apps/mobile && npm test -- --testPathPattern=SetupScreen --passWithNoTests
```

Expected: all existing tests PASS, new test PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/SetupScreen.js apps/mobile/src/__tests__/SetupScreen.test.js
git commit -m "feat: add example day names to Festival Days helper text"
```

---

## Task 2: FounderToolsScreen Partial Failure Warning

**Files:**
- Modify: `apps/mobile/src/screens/FounderToolsScreen.js`
- Modify: `apps/mobile/App.js` (line ~1507 — pass `festivalDays` prop)
- Test: `apps/mobile/src/__tests__/FounderToolsScreen.test.js`

- [ ] **Step 1: Write failing tests**

Add a new describe block at the bottom of `FounderToolsScreen.test.js`:

```js
describe('FounderToolsScreen — partial failure warning', () => {
  const FESTIVAL_DAYS = [
    { dayIndex: 1, label: 'Friday' },
    { dayIndex: 2, label: 'Saturday' },
    { dayIndex: 3, label: 'Sunday' },
  ];

  it('shows no warning when all festival days are in days_processed', () => {
    const { queryByText } = render(
      <FounderToolsScreen
        {...makeProps({
          festivalDays: FESTIVAL_DAYS,
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 80, days_processed: ['Friday', 'Saturday', 'Sunday'] },
        })}
      />
    );
    expect(queryByText(/Couldn't read/)).toBeNull();
  });

  it('shows amber warning listing missing days when some days absent from days_processed', () => {
    const { getByText } = render(
      <FounderToolsScreen
        {...makeProps({
          festivalDays: FESTIVAL_DAYS,
          lineupImportState: 'done',
          lineupImportResult: { sets_created: 50, days_processed: ['Friday'] },
        })}
      />
    );
    expect(getByText(/Couldn't read: Saturday, Sunday/)).toBeTruthy();
    expect(getByText(/Re-upload just those images/)).toBeTruthy();
  });

  it('shows no warning when lineupImportResult is null', () => {
    const { queryByText } = render(
      <FounderToolsScreen
        {...makeProps({
          festivalDays: FESTIVAL_DAYS,
          lineupImportState: 'idle',
          lineupImportResult: null,
        })}
      />
    );
    expect(queryByText(/Couldn't read/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/mobile && npm test -- --testPathPattern=FounderToolsScreen --passWithNoTests
```

Expected: FAIL — component doesn't accept `festivalDays`, no warning rendered.

- [ ] **Step 3: Add `festivalDays` prop + `missingDays` memo + warning JSX + styles to FounderToolsScreen.js**

Replace the function signature:

```js
export function FounderToolsScreen({
  inviteCode,
  groupName,
  onOpenSchedule,
  onImportLineup,
  onCopyInvite,
  inviteCopied,
  onDeleteLineup,
  lineupImportState = 'idle',
  lineupImportResult = null,
  officialLineupStats = null,
}) {
```

with:

```js
export function FounderToolsScreen({
  inviteCode,
  groupName,
  onOpenSchedule,
  onImportLineup,
  onCopyInvite,
  inviteCopied,
  onDeleteLineup,
  lineupImportState = 'idle',
  lineupImportResult = null,
  officialLineupStats = null,
  festivalDays = [],
}) {
```

Add the `missingDays` memo immediately after `const styles = useMemo(() => makeStyles(C), [C]);`:

```js
  const missingDays = useMemo(() => {
    if (!lineupImportResult?.days_processed) return [];
    return (festivalDays || [])
      .map((d) => d.label)
      .filter((label) => !lineupImportResult.days_processed.includes(label));
  }, [festivalDays, lineupImportResult]);
```

Add the warning JSX immediately after the `</View>` that closes the `successBox` (the `lineupImportState === 'done' && lineupImportResult` branch closes at line ~57 in the original). The full `done` branch becomes:

```jsx
        ) : lineupImportState === 'done' && lineupImportResult ? (
          <>
            <View style={styles.successBox}>
              <Text style={styles.successText}>
                ✓ {lineupImportResult.sets_created} sets imported
                {lineupImportResult.days_processed?.length
                  ? ` across ${lineupImportResult.days_processed.join(', ')}`
                  : ''}
              </Text>
            </View>
            {missingDays.length > 0 ? (
              <View style={styles.warningBox}>
                <Text style={styles.warningText}>
                  Couldn't read: {missingDays.join(', ')}. Re-upload just those images to add the missing days.
                </Text>
              </View>
            ) : null}
          </>
```

Add the new styles inside `makeStyles`:

```js
  warningBox: {
    backgroundColor: C.warningBg || '#fffbeb',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.warningBorder || '#fcd34d',
  },
  warningText: { color: C.warning || '#92400e', fontWeight: '600', fontSize: 13 },
```

- [ ] **Step 4: Pass `festivalDays` to FounderToolsScreen in App.js**

In `App.js`, find the `<FounderToolsScreen` render block (~line 1506). Add `festivalDays={festivalDays}`:

```jsx
      {activeView === 'founder' ? (
        <FounderToolsScreen
          inviteCode={inviteCode}
          groupName={homeSnapshot?.group?.name}
          onOpenSchedule={() => setActiveView('group')}
          onImportLineup={importOfficialLineup}
          onCopyInvite={copyInviteCode}
          inviteCopied={inviteCopied}
          onDeleteLineup={deleteOfficialLineup}
          lineupImportState={lineupImportState}
          lineupImportResult={lineupImportResult}
          festivalDays={festivalDays}
          officialLineupStats={
            homeSnapshot?.group?.has_official_lineup
              ? {
                  set_count: homeSnapshot.group.official_set_count ?? 0,
                  days: homeSnapshot.group.official_days ?? [],
                }
              : null
          }
        />
      ) : null}
```

- [ ] **Step 5: Run tests to verify passing**

```
cd apps/mobile && npm test -- --testPathPattern=FounderToolsScreen --passWithNoTests
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/src/screens/FounderToolsScreen.js apps/mobile/App.js apps/mobile/src/__tests__/FounderToolsScreen.test.js
git commit -m "feat: show partial-failure warning in FounderToolsScreen when some days couldn't be parsed"
```

---

## Task 3: SetupScreen — `upload_official_schedule` Step UI

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Test: `apps/mobile/src/__tests__/SetupScreen.test.js`

- [ ] **Step 1: Write failing tests**

Add a new describe block in `SetupScreen.test.js`. First update `makeProps` to include the new props (these will be needed for all remaining tasks too — add them now):

Find the `makeProps` function in `SetupScreen.test.js` and add the following fields inside the returned object before `...overrides`:

```js
    onboardingLineupState: 'idle',
    onboardingLineupResult: null,
    onImportOfficialSchedule: jest.fn(),
    onSkipOfficialSchedule: jest.fn(),
    onFinishSetup: jest.fn(),
    onGoBack: jest.fn(),
    onStartOver: jest.fn(),
    onSkipMemberLineupIntro: jest.fn(),
```

Then add this describe block:

```js
describe('SetupScreen — upload_official_schedule step', () => {
  function makeOfficialProps(overrides = {}) {
    return makeProps({ onboardingStep: 'upload_official_schedule', ...overrides });
  }

  it('renders title and Upload + skip buttons in idle state', () => {
    const { getByText } = render(<SetupScreen {...makeOfficialProps()} />);
    expect(getByText('Import Official Schedule')).toBeTruthy();
    expect(getByText('Upload Schedule Images')).toBeTruthy();
    expect(getByText('Skip for Now — upload from Founder Tools after setup')).toBeTruthy();
  });

  it('renders spinner and help text when uploading', () => {
    const { getByText } = render(
      <SetupScreen {...makeOfficialProps({ onboardingLineupState: 'uploading' })} />
    );
    expect(getByText(/Importing lineup/)).toBeTruthy();
    expect(getByText(/keep the app open/)).toBeTruthy();
  });

  it('renders success text and Go to Group Schedule button (no skip) on full done', () => {
    const { getByText, queryByText } = render(
      <SetupScreen
        {...makeOfficialProps({
          onboardingLineupState: 'done',
          onboardingLineupResult: { sets_created: 80, days_processed: ['Friday', 'Saturday', 'Sunday'] },
          festivalDays: [
            { dayIndex: 1, label: 'Friday' },
            { dayIndex: 2, label: 'Saturday' },
            { dayIndex: 3, label: 'Sunday' },
          ],
        })}
      />
    );
    expect(getByText(/80 sets imported/)).toBeTruthy();
    expect(getByText('Go to Group Schedule →')).toBeTruthy();
    expect(queryByText(/Skip/)).toBeNull();
  });

  it('renders amber warning listing missing days on partial done', () => {
    const { getByText } = render(
      <SetupScreen
        {...makeOfficialProps({
          onboardingLineupState: 'done',
          onboardingLineupResult: { sets_created: 30, days_processed: ['Friday'] },
          festivalDays: [
            { dayIndex: 1, label: 'Friday' },
            { dayIndex: 2, label: 'Saturday' },
          ],
        })}
      />
    );
    expect(getByText(/30 sets imported/)).toBeTruthy();
    expect(getByText(/Couldn't read: Saturday/)).toBeTruthy();
    expect(getByText(/Founder Tools/)).toBeTruthy();
  });

  it('renders error message with retry/skip and Founder Tools hint on error', () => {
    const { getByText } = render(
      <SetupScreen {...makeOfficialProps({ onboardingLineupState: 'error', error: 'Upload failed' })} />
    );
    expect(getByText('Try Again')).toBeTruthy();
    expect(getByText('Skip for Now')).toBeTruthy();
    expect(getByText(/retry.*Founder Tools/i)).toBeTruthy();
  });

  it('calls onImportOfficialSchedule when Upload button pressed', () => {
    const onImportOfficialSchedule = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeOfficialProps({ onImportOfficialSchedule })} />
    );
    fireEvent.press(getByText('Upload Schedule Images'));
    expect(onImportOfficialSchedule).toHaveBeenCalledTimes(1);
  });

  it('calls onSkipOfficialSchedule when skip button pressed (idle)', () => {
    const onSkipOfficialSchedule = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeOfficialProps({ onSkipOfficialSchedule })} />
    );
    fireEvent.press(getByText('Skip for Now — upload from Founder Tools after setup'));
    expect(onSkipOfficialSchedule).toHaveBeenCalledTimes(1);
  });

  it('calls onFinishSetup when Go to Group Schedule pressed (done state)', () => {
    const onFinishSetup = jest.fn();
    const { getByText } = render(
      <SetupScreen
        {...makeOfficialProps({
          onFinishSetup,
          onboardingLineupState: 'done',
          onboardingLineupResult: { sets_created: 10, days_processed: ['Friday'] },
          festivalDays: [{ dayIndex: 1, label: 'Friday' }],
        })}
      />
    );
    fireEvent.press(getByText('Go to Group Schedule →'));
    expect(onFinishSetup).toHaveBeenCalledTimes(1);
  });

  it('calls onSkipOfficialSchedule when Skip for Now pressed (error state)', () => {
    const onSkipOfficialSchedule = jest.fn();
    const { getByText } = render(
      <SetupScreen
        {...makeOfficialProps({ onSkipOfficialSchedule, onboardingLineupState: 'error', error: 'Upload failed' })}
      />
    );
    fireEvent.press(getByText('Skip for Now'));
    expect(onSkipOfficialSchedule).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/mobile && npm test -- --testPathPattern=SetupScreen --passWithNoTests
```

Expected: FAIL — new describe block fails with missing props / unrendered step.

- [ ] **Step 3: Add new props to SetupScreen function signature**

In `SetupScreen.js`, add to the destructured props list (after `onBrowseFullLineup`):

```js
  // upload_official_schedule step
  onboardingLineupState = 'idle',
  onboardingLineupResult = null,
  onImportOfficialSchedule,
  onSkipOfficialSchedule,
  onFinishSetup,
  // back navigation (Tasks 4 & 5)
  onGoBack,
  onStartOver,
  // member_lineup_intro step
  onSkipMemberLineupIntro,
```

- [ ] **Step 4: Add `upload_official_schedule` step JSX to SetupScreen.js**

Add this block immediately before the `{onboardingStep === 'review_days' ? ...}` block (around line 219):

```jsx
      {onboardingStep === 'upload_official_schedule' ? (() => {
        const daysProcessed = onboardingLineupResult?.days_processed || [];
        const missingDays = (festivalDays || [])
          .map((d) => d.label)
          .filter((label) => !daysProcessed.includes(label));

        return (
          <View style={styles.stepCard}>
            <Text style={styles.stepTitle}>Import Official Schedule</Text>
            {onboardingLineupState === 'uploading' ? (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                  <ActivityIndicator color={C.primary} size="small" />
                  <Text style={styles.helper}>Importing lineup… this may take 1–2 minutes. Please keep the app open.</Text>
                </View>
              </View>
            ) : onboardingLineupState === 'done' && onboardingLineupResult ? (
              <>
                <View style={styles.successBox}>
                  <Text style={styles.successText}>
                    ✓ {onboardingLineupResult.sets_created} sets imported
                    {daysProcessed.length ? ` across ${daysProcessed.join(', ')}` : ''}
                  </Text>
                </View>
                {missingDays.length > 0 ? (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>
                      Couldn't read: {missingDays.join(', ')}. Re-upload those days from Founder Tools after setup.
                    </Text>
                  </View>
                ) : null}
                <ActionButton label="Go to Group Schedule →" onPress={onFinishSetup} primary disabled={loading} />
              </>
            ) : onboardingLineupState === 'error' ? (
              <>
                <Text style={styles.helper}>You can retry this after setup from Founder Tools → Official Lineup.</Text>
                <ActionButton label="Try Again" onPress={onImportOfficialSchedule} primary disabled={loading} />
                <ActionButton label="Skip for Now" onPress={onSkipOfficialSchedule} disabled={loading} />
              </>
            ) : (
              <>
                <Text style={styles.helper}>
                  Upload the official day poster(s) so everyone in your group can browse and pick artists — no screenshots needed.
                </Text>
                <ActionButton
                  label="Upload Schedule Images"
                  onPress={onImportOfficialSchedule}
                  primary
                  disabled={loading}
                />
                <ActionButton
                  label="Skip for Now — upload from Founder Tools after setup"
                  onPress={onSkipOfficialSchedule}
                  disabled={loading}
                />
              </>
            )}
          </View>
        );
      })() : null}
```

- [ ] **Step 5: Add `successBox` and `warningBox` styles to `makeStyles` in SetupScreen.js**

Add inside `makeStyles`:

```js
  successBox: {
    backgroundColor: C.successBg || '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.successBorder || '#86efac',
  },
  successText: { color: C.success || '#16a34a', fontWeight: '700', fontSize: 13 },
  warningBox: {
    backgroundColor: C.warningBg || '#fffbeb',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: C.warningBorder || '#fcd34d',
  },
  warningText: { color: C.warning || '#92400e', fontWeight: '600', fontSize: 13 },
```

- [ ] **Step 6: Run tests to verify passing**

```
cd apps/mobile && npm test -- --testPathPattern=SetupScreen --passWithNoTests
```

Expected: all SetupScreen tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/src/screens/SetupScreen.js apps/mobile/src/__tests__/SetupScreen.test.js
git commit -m "feat: add upload_official_schedule onboarding step UI to SetupScreen"
```

---

## Task 4: SetupScreen — `member_lineup_intro` Step UI

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Test: `apps/mobile/src/__tests__/SetupScreen.test.js`

- [ ] **Step 1: Write failing tests**

Add a new describe block in `SetupScreen.test.js`:

```js
describe('SetupScreen — member_lineup_intro step', () => {
  function makeIntroProps(overrides = {}) {
    return makeProps({ onboardingStep: 'member_lineup_intro', ...overrides });
  }

  it('renders Schedule is Ready title', () => {
    const { getByText } = render(<SetupScreen {...makeIntroProps()} />);
    expect(getByText('Schedule is Ready')).toBeTruthy();
  });

  it('renders Go to Group Schedule as primary button', () => {
    const { getByText } = render(<SetupScreen {...makeIntroProps()} />);
    expect(getByText('Go to Group Schedule →')).toBeTruthy();
  });

  it('renders Upload my own screenshots as secondary button', () => {
    const { getByText } = render(<SetupScreen {...makeIntroProps()} />);
    expect(getByText('Upload my own screenshots →')).toBeTruthy();
  });

  it('calls onFinishSetup when primary button pressed', () => {
    const onFinishSetup = jest.fn();
    const { getByText } = render(<SetupScreen {...makeIntroProps({ onFinishSetup })} />);
    fireEvent.press(getByText('Go to Group Schedule →'));
    expect(onFinishSetup).toHaveBeenCalledTimes(1);
  });

  it('calls onSkipMemberLineupIntro when secondary button pressed', () => {
    const onSkipMemberLineupIntro = jest.fn();
    const { getByText } = render(<SetupScreen {...makeIntroProps({ onSkipMemberLineupIntro })} />);
    fireEvent.press(getByText('Upload my own screenshots →'));
    expect(onSkipMemberLineupIntro).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/mobile && npm test -- --testPathPattern=SetupScreen --passWithNoTests
```

Expected: FAIL — `member_lineup_intro` not rendered.

- [ ] **Step 3: Add `member_lineup_intro` step JSX**

Add immediately before the `{onboardingStep === 'review_days' ? ...}` block, after the `upload_official_schedule` block:

```jsx
      {onboardingStep === 'member_lineup_intro' ? (
        <View style={styles.stepCard}>
          <Text style={styles.stepTitle}>Schedule is Ready</Text>
          <Text style={styles.helper}>
            The official lineup has been imported — you can browse every artist and tap to add them to your picks right from the group grid.
          </Text>
          <ActionButton label="Go to Group Schedule →" onPress={onFinishSetup} primary disabled={loading} />
          <ActionButton label="Upload my own screenshots →" onPress={onSkipMemberLineupIntro} disabled={loading} />
          <Text style={styles.helper}>You can always upload screenshots later from the My Schedule tab.</Text>
        </View>
      ) : null}
```

- [ ] **Step 4: Run tests to verify passing**

```
cd apps/mobile && npm test -- --testPathPattern=SetupScreen --passWithNoTests
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/src/screens/SetupScreen.js apps/mobile/src/__tests__/SetupScreen.test.js
git commit -m "feat: add member_lineup_intro onboarding step UI to SetupScreen"
```

---

## Task 5: SetupScreen — Back Navigation on Every Upload Step

**Files:**
- Modify: `apps/mobile/src/screens/SetupScreen.js`
- Test: `apps/mobile/src/__tests__/SetupScreen.test.js`

The rule:
- `upload_official_schedule` → always "Start over" link
- `member_lineup_intro` → always "Start over" link
- `upload_all_days` day 1 (founder OR member with lineup) → `← Back` button
- `upload_all_days` day 1 (member without lineup) → "Start over" link
- `upload_all_days` day N > 1 → `← Back` button
- `review_days` → `← Back` button

The component already receives `userRole`, `uploadDayIndex`, `festivalDays`, `hasOfficialLineup`.

- [ ] **Step 1: Write failing tests**

Add a new describe block in `SetupScreen.test.js`:

```js
describe('SetupScreen — back navigation', () => {
  it('upload_official_schedule shows "Start over" link, calls onStartOver', () => {
    const onStartOver = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeProps({ onboardingStep: 'upload_official_schedule', onStartOver })} />
    );
    expect(getByText('Start over')).toBeTruthy();
    fireEvent.press(getByText('Start over'));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('member_lineup_intro shows "Start over" link, calls onStartOver', () => {
    const onStartOver = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeProps({ onboardingStep: 'member_lineup_intro', onStartOver })} />
    );
    expect(getByText('Start over')).toBeTruthy();
    fireEvent.press(getByText('Start over'));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('upload_all_days day 1 (founder) shows ← Back, calls onGoBack', () => {
    const onGoBack = jest.fn();
    const { getByText } = render(
      <SetupScreen
        {...makeProps({
          onboardingStep: 'upload_all_days',
          userRole: 'founder',
          uploadDayIndex: 1,
          festivalDays: [{ dayIndex: 1, label: 'Friday' }],
          onGoBack,
          hasOfficialLineup: false,
        })}
      />
    );
    fireEvent.press(getByText('← Back'));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it('upload_all_days day 1 (member with lineup) shows ← Back, calls onGoBack', () => {
    const onGoBack = jest.fn();
    const { getByText } = render(
      <SetupScreen
        {...makeProps({
          onboardingStep: 'upload_all_days',
          userRole: 'member',
          uploadDayIndex: 1,
          festivalDays: [{ dayIndex: 1, label: 'Friday' }],
          onGoBack,
          hasOfficialLineup: true,
        })}
      />
    );
    fireEvent.press(getByText('← Back'));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it('upload_all_days day 1 (member without lineup) shows "Start over" link, calls onStartOver', () => {
    const onStartOver = jest.fn();
    const { getByText } = render(
      <SetupScreen
        {...makeProps({
          onboardingStep: 'upload_all_days',
          userRole: 'member',
          uploadDayIndex: 1,
          festivalDays: [{ dayIndex: 1, label: 'Friday' }],
          onStartOver,
          hasOfficialLineup: false,
        })}
      />
    );
    expect(getByText('Start over')).toBeTruthy();
    fireEvent.press(getByText('Start over'));
    expect(onStartOver).toHaveBeenCalledTimes(1);
  });

  it('upload_all_days day 2 shows ← Back regardless of role, calls onGoBack', () => {
    const onGoBack = jest.fn();
    const { getByText } = render(
      <SetupScreen
        {...makeProps({
          onboardingStep: 'upload_all_days',
          userRole: 'member',
          uploadDayIndex: 2,
          festivalDays: [{ dayIndex: 1, label: 'Friday' }, { dayIndex: 2, label: 'Saturday' }],
          onGoBack,
          hasOfficialLineup: false,
        })}
      />
    );
    fireEvent.press(getByText('← Back'));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it('review_days shows ← Back, calls onGoBack', () => {
    const onGoBack = jest.fn();
    const { getByText } = render(
      <SetupScreen {...makeProps({ onboardingStep: 'review_days', onGoBack })} />
    );
    fireEvent.press(getByText('← Back'));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd apps/mobile && npm test -- --testPathPattern=SetupScreen --passWithNoTests
```

Expected: FAIL — `Start over` text not found, back buttons not wired.

- [ ] **Step 3: Add `StartOverLink` component to SetupScreen.js**

Add this new component function immediately before `function ActionButton`:

```jsx
function StartOverLink({ onPress, styles }) {
  return (
    <Pressable onPress={onPress} style={styles.startOverLink}>
      <Text style={styles.startOverText}>Start over</Text>
    </Pressable>
  );
}
```

- [ ] **Step 4: Add start-over styles to `makeStyles`**

```js
  startOverLink: { alignItems: 'center', paddingTop: 4 },
  startOverText: { color: C.textMuted, fontSize: 12, textDecorationLine: 'underline' },
```

- [ ] **Step 5: Add `StartOverLink` to `upload_official_schedule` step**

In the `upload_official_schedule` step JSX, add `<StartOverLink onPress={onStartOver} styles={styles} />` as the last child of the outer `<View style={styles.stepCard}>` (before the closing `</View>`). Place it after whichever state-dependent content block renders:

```jsx
            <StartOverLink onPress={onStartOver} styles={styles} />
          </View>
```

- [ ] **Step 6: Add `StartOverLink` to `member_lineup_intro` step**

In the `member_lineup_intro` step JSX, add `<StartOverLink onPress={onStartOver} styles={styles} />` as the last child of the `<View style={styles.stepCard}>`, after the helper text:

```jsx
          <Text style={styles.helper}>You can always upload screenshots later from the My Schedule tab.</Text>
          <StartOverLink onPress={onStartOver} styles={styles} />
        </View>
```

- [ ] **Step 7: Add back navigation to `upload_all_days` step**

In the `upload_all_days` IIFE block, compute whether to show back vs start-over, then render it. At the top of the returned `<View style={styles.stepCard}>`, add:

```jsx
          <View style={styles.stepCard}>
            {(() => {
              const isDay1 = dayPosition === 1;
              const founderOrMemberWithLineup = userRole === 'founder' || hasOfficialLineup;
              if (!isDay1 || founderOrMemberWithLineup) {
                return <ActionButton label="← Back" onPress={onGoBack} disabled={loading} />;
              }
              return <StartOverLink onPress={onStartOver} styles={styles} />;
            })()}
            <Text style={styles.stepTitle}>Upload {truncatedLabel} schedule</Text>
```

- [ ] **Step 8: Add `← Back` button to `review_days` step**

In the `review_days` step JSX, add `<ActionButton label="← Back" onPress={onGoBack} disabled={loading} />` as the first child inside `<View style={styles.stepCard}>`:

```jsx
      {onboardingStep === 'review_days' ? (
        <View style={styles.stepCard}>
          <ActionButton label="← Back" onPress={onGoBack} disabled={loading} />
          <Text style={styles.stepTitle}>Review Your Schedule</Text>
```

- [ ] **Step 9: Update error display to exclude `upload_official_schedule` step**

Find line 239 in `SetupScreen.js`:

```jsx
      {error && onboardingStep !== 'upload_all_days' ? <Text style={styles.error}>{error}</Text> : null}
```

Change to:

```jsx
      {error && onboardingStep !== 'upload_all_days' && onboardingStep !== 'upload_official_schedule' ? <Text style={styles.error}>{error}</Text> : null}
```

(The `upload_official_schedule` step manages its own error display via `onboardingLineupState === 'error'`.)

- [ ] **Step 10: Run tests to verify passing**

```
cd apps/mobile && npm test -- --testPathPattern=SetupScreen --passWithNoTests
```

Expected: all tests PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/mobile/src/screens/SetupScreen.js apps/mobile/src/__tests__/SetupScreen.test.js
git commit -m "feat: add back navigation and StartOverLink to all upload onboarding steps"
```

---

## Task 6: App.js — New State, Persistence, and Onboarding Handlers

**Files:**
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Add new state variables**

After line 117 (`const [dayStates, setDayStates] = useState({});`), add:

```js
  const [onboardingLineupState, setOnboardingLineupState] = useState('idle'); // 'idle' | 'uploading' | 'done' | 'error'
  const [onboardingLineupResult, setOnboardingLineupResult] = useState(null); // { sets_created, days_processed } | null
```

- [ ] **Step 2: Add new state to `saveAppState` call and dependency array**

In the `saveAppState` call (~line 228), add two new fields alongside `dayStates`:

```js
      dayStates,
      onboardingLineupState,
      onboardingLineupResult,
```

In the dependency array of that same `useEffect` (after `dayStates,`), add:

```js
    onboardingLineupState,
    onboardingLineupResult,
```

- [ ] **Step 3: Add hydration of new state in `loadAppState`**

In the `loadAppState` block (~line 182, after `setDayStates(sanitizedDayStates);`), add:

```js
        setOnboardingLineupState(storedState.onboardingLineupState || 'idle');
        setOnboardingLineupResult(storedState.onboardingLineupResult || null);
```

- [ ] **Step 4: Add `importOfficialScheduleDuringOnboarding` handler**

Add immediately after the `importOfficialLineup` handler (~line 1201):

```js
  const importOfficialScheduleDuringOnboarding = async () => {
    try {
      const uris = await pickImages(3);
      if (!uris) return;
      setOnboardingLineupState('uploading');
      const result = await uploadImages(
        apiUrl,
        `/v1/groups/${groupId}/lineup/import`,
        memberSession,
        uris,
      );
      // Complete failure: API returned but nothing was imported
      if (!result.sets_created && (!result.days_processed || result.days_processed.length === 0)) {
        setOnboardingLineupState('error');
        setError('No sets could be imported. Try uploading clearer images.');
        return;
      }
      setOnboardingLineupResult(result);
      setOnboardingLineupState('done');
      // Refresh home snapshot so hasOfficialLineup becomes true
      const homePayload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: memberSession,
      });
      setHomeSnapshot(homePayload);
    } catch (err) {
      setOnboardingLineupState('error');
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  };

  const proceedToPersonalSchedule = () => {
    setOnboardingLineupState('idle');
    setOnboardingStep('upload_all_days');
  };

  const skipMemberLineupIntro = () => {
    setOnboardingStep('upload_all_days');
  };
```

- [ ] **Step 5: Add `handleOnboardingBack` and `handleStartOver` handlers**

Add immediately after `skipMemberLineupIntro`:

```js
  const handleOnboardingBack = () => {
    if (onboardingStep === 'upload_all_days') {
      const currentIdx = festivalDays.findIndex((d) => d.dayIndex === uploadDayIndex);
      if (currentIdx > 0) {
        setUploadDayIndex(festivalDays[currentIdx - 1].dayIndex);
      } else if (userRole === 'founder') {
        setOnboardingStep('upload_official_schedule');
      } else {
        // member with official lineup — day 1 back goes to member_lineup_intro
        setOnboardingStep('member_lineup_intro');
      }
    } else if (onboardingStep === 'review_days') {
      setUploadDayIndex(festivalDays[festivalDays.length - 1]?.dayIndex ?? 1);
      setOnboardingStep('upload_all_days');
    }
  };

  const handleStartOver = () => {
    Alert.alert(
      'Start Over?',
      'This will delete your group and restart onboarding. You need an internet connection to do this.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start Over', style: 'destructive', onPress: resetFlow },
      ],
    );
  };
```

- [ ] **Step 6: Run existing tests to verify no regressions**

```
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/mobile/App.js
git commit -m "feat: add onboarding lineup state, handlers for upload_official_schedule and member_lineup_intro flows"
```

---

## Task 7: App.js — Step Transitions and Props Wiring

**Files:**
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Update `completeFestivalSetup` to go to `upload_official_schedule`**

Find (~line 852):

```js
      setOnboardingStep('upload_all_days');
```

This is the last line inside the `completeFestivalSetup` `run` callback. Change it to:

```js
      setOnboardingStep('upload_official_schedule');
```

- [ ] **Step 2: Update `beginProfile` join path to conditionally show `member_lineup_intro`**

Find (~line 827):

```js
      setOnboardingStep('upload_all_days');
```

This is the last line in the `beginProfile` join-path block. Change it to:

```js
      if (homePayload.group?.has_official_lineup) {
        setOnboardingStep('member_lineup_intro');
      } else {
        setOnboardingStep('upload_all_days');
      }
```

- [ ] **Step 3: Pass all new props to `<SetupScreen>`**

Find the `<SetupScreen` render block (~line 1442). The current closing prop is `onBrowseFullLineup={finishUploadFlow}`. Add the new props:

```jsx
          onboardingLineupState={onboardingLineupState}
          onboardingLineupResult={onboardingLineupResult}
          onImportOfficialSchedule={importOfficialScheduleDuringOnboarding}
          onSkipOfficialSchedule={proceedToPersonalSchedule}
          onFinishSetup={finishUploadFlow}
          onGoBack={handleOnboardingBack}
          onStartOver={handleStartOver}
          onSkipMemberLineupIntro={skipMemberLineupIntro}
```

- [ ] **Step 4: Add `onboardingLineupState` reset inside `resetFlow`**

Find the `resetFlow` function (~line 1263). After `setDayStates({});`, add:

```js
    setOnboardingLineupState('idle');
    setOnboardingLineupResult(null);
```

- [ ] **Step 5: Run all tests**

```
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/App.js
git commit -m "feat: wire upload_official_schedule and member_lineup_intro step transitions in App.js"
```

---

## Task 8: App.js — Fix `resetFlow` (Require Online + Delete Backend)

**Files:**
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Replace `resetFlow` implementation**

Find the current `resetFlow` function (~line 1263):

```js
  const resetFlow = async () => {
    await clearSessionData(true);
    setUserRole('member');
    ...
  };
```

Replace the entire function body with:

```js
  const resetFlow = async () => {
    if (memberSession) {
      if (!isOnline) {
        Alert.alert(
          'You\'re Offline',
          'Connect to the internet to fully reset the app. This ensures your data is deleted from the server.',
        );
        return;
      }
      try {
        await apiRequest({
          baseUrl: apiUrl,
          path: '/v1/members/me',
          method: 'DELETE',
          sessionToken: memberSession,
          body: { confirm: true },
        });
      } catch (_err) {
        // Backend deletion failed — proceed with local reset anyway.
        // User can clean up via "Delete My Data" if needed.
      }
    }
    await clearSessionData(true);
    setUserRole('member');
    setDisplayName('');
    setGroupName('');
    setInviteCodeInput('');
    setScreenshotCount('3');
    setOnboardingStep('welcome');
    setActiveView('onboarding');
    setMoreSheetOpen(false);
    setSelectedChipColor(CHIP_COLOR_OPTIONS[0]);
    setAvailableJoinColors([]);
    setFestivalDays([{ dayIndex: 1, label: '' }]);
    setUploadDayIndex(1);
    setDayStates({});
    setOnboardingLineupState('idle');
    setOnboardingLineupResult(null);
    setError('');
    setLog(['Reset: onboarding restarted']);
  };
```

- [ ] **Step 2: Run all tests**

```
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/App.js
git commit -m "fix: resetFlow requires online connection and deletes backend data before local reset"
```

---

## Task 9: App.js — Fix Skip-Day Spinner (`allDaysReady` Guard)

**Files:**
- Modify: `apps/mobile/App.js`

- [ ] **Step 1: Replace `allDaysReady` memo**

Find the current memo (~line 1335):

```js
  const allDaysReady = useMemo(
    () =>
      onboardingStep === 'review_days' &&
      festivalDays.length > 0 &&
      festivalDays.every((day) => {
        const state = dayStates[day.dayIndex] || { status: 'idle' };
        return state.status === 'idle' || (state.status === 'done' && state.confirmed);
      }),
    [onboardingStep, festivalDays, dayStates]
  );
```

Replace with:

```js
  const allDaysReady = useMemo(
    () =>
      onboardingStep === 'review_days' &&
      festivalDays.length > 0 &&
      festivalDays.some((day) => (dayStates[day.dayIndex] || {}).status === 'done') &&
      festivalDays.every((day) => {
        const state = dayStates[day.dayIndex] || { status: 'idle' };
        return state.status === 'idle' || (state.status === 'done' && state.confirmed);
      }),
    [onboardingStep, festivalDays, dayStates]
  );
```

The added `.some(...)` guard means auto-advance only fires when at least one day has actual uploaded content. All-skipped sessions reach `review_days` and stay there; the user presses `›` in the header to finish deliberately.

- [ ] **Step 2: Run all tests**

```
cd apps/mobile && npm test -- --passWithNoTests
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/mobile/App.js
git commit -m "fix: prevent auto-advance from review_days when all days are skipped (no uploads)"
```

---

## Task 10: Push All Commits

- [ ] **Step 1: Push to remote**

```
git push origin main
```

Expected: Render auto-deploys from remote main. All 9 commits pushed.

---

## Post-Implementation Checklist

After all tasks are done, manually verify:

1. **Festival Days**: Open setup → "Add Day" → helper text reads `(e.g. "Friday", "Saturday", "Sunday")`
2. **Founder onboarding**: Create group → lands on "Import Official Schedule" (not individual day upload)
3. **Official schedule upload**: Upload images → success with count; try with one bad image → amber warning
4. **Skip official schedule**: Press skip → goes to personal screenshot day 1
5. **Member with lineup**: Join group that has official schedule → "Schedule is Ready" screen
6. **Go to Group Schedule**: Press primary → arrives at grid
7. **Upload my own screenshots**: Press secondary → goes to personal day 1 uploads
8. **Back navigation**: All upload steps have either `← Back` or "Start over" as appropriate
9. **Start over**: Tap "Start over" → Alert → confirm → reset (fails if offline with helpful message)
10. **Reset App (offline)**: Put device in airplane mode → tap Reset App → "You're Offline" alert
11. **Skip-day spinner**: Skip all days → arrives at `review_days` with no spinner; press `›` to finish
12. **FounderTools partial failure**: Upload official lineup where one day fails → amber warning lists missing day
