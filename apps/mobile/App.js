import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { apiRequest } from './src/api/client';
import { EditMyScheduleScreen } from './src/screens/EditMyScheduleScreen';
import { FounderToolsScreen } from './src/screens/FounderToolsScreen';
import { GroupScheduleScreen } from './src/screens/GroupScheduleScreen';
import { IndividualSchedulesScreen } from './src/screens/IndividualSchedulesScreen';
import { SetupScreen } from './src/screens/SetupScreen';

const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';
const CHIP_COLOR_OPTIONS = [
  '#4D73FF',
  '#20A36B',
  '#E17A2D',
  '#C558A0',
  '#2B9FA8',
  '#8A5CE6',
  '#B44242',
  '#4D7A2A',
  '#3578C4',
  '#D18A1F',
  '#6D5A4C',
  '#9A4FB5'
];

export default function App() {
  const scheduleFilterTimeoutRef = useRef(null);
  const scheduleRequestIdRef = useRef(0);
  const [activeView, setActiveView] = useState('onboarding');
  const [menuOpen, setMenuOpen] = useState(false);

  const apiUrl = DEFAULT_API_URL;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);

  const [userRole, setUserRole] = useState('member');
  const [displayName, setDisplayName] = useState('Alex');
  const [groupName, setGroupName] = useState('Festival Together Crew');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [screenshotCount, setScreenshotCount] = useState('3');
  const [onboardingStep, setOnboardingStep] = useState('welcome');
  const [selectedChipColor, setSelectedChipColor] = useState(CHIP_COLOR_OPTIONS[0]);
  const [availableJoinColors, setAvailableJoinColors] = useState([]);

  const [founderSession, setFounderSession] = useState('');
  const [memberSession, setMemberSession] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [groupId, setGroupId] = useState('');
  const [isFounder, setIsFounder] = useState(false);

  const [personalSets, setPersonalSets] = useState([]);
  const [homeSnapshot, setHomeSnapshot] = useState(null);
  const [scheduleSnapshot, setScheduleSnapshot] = useState(null);
  const [individualSnapshot, setIndividualSnapshot] = useState(null);

  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  const appendLog = (line) => setLog((prev) => [line, ...prev].slice(0, 16));

  useEffect(() => () => {
    if (scheduleFilterTimeoutRef.current) {
      clearTimeout(scheduleFilterTimeoutRef.current);
    }
  }, []);

  const run = async (label, action) => {
    setLoading(true);
    setError('');
    try {
      await action();
      appendLog(`OK: ${label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      appendLog(`ERR: ${label} -> ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const clearSessionData = () => {
    if (scheduleFilterTimeoutRef.current) {
      clearTimeout(scheduleFilterTimeoutRef.current);
      scheduleFilterTimeoutRef.current = null;
    }
    scheduleRequestIdRef.current += 1;
    setFounderSession('');
    setMemberSession('');
    setInviteCode('');
    setGroupId('');
    setIsFounder(false);
    setPersonalSets([]);
    setHomeSnapshot(null);
    setScheduleSnapshot(null);
    setIndividualSnapshot(null);
    setSelectedMemberIds([]);
  };

  const choosePath = (role) => {
    setError('');
    setUserRole(role);
    if (role === 'member') {
      setAvailableJoinColors([]);
    }
    setOnboardingStep(role === 'founder' ? 'profile_create' : 'profile_join');
  };

  const createAnonymousSession = async () => {
    const payload = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/sessions',
      method: 'POST'
    });
    return payload.token;
  };

  const beginProfile = () =>
    run('start onboarding', async () => {
      if (!displayName.trim()) throw new Error('Enter your name first');
      if (userRole !== 'founder' && userRole !== 'member') throw new Error('Choose create or join first');
      if (!selectedChipColor) throw new Error('Choose your color first');
      clearSessionData();

      if (userRole === 'founder') {
        if (!groupName.trim()) throw new Error('Enter group name');

        const founderPayload = await apiRequest({
          baseUrl: apiUrl,
          path: '/v1/groups',
          method: 'POST',
          body: { group_name: groupName.trim(), display_name: displayName.trim(), chip_color: selectedChipColor }
        });

        const nextFounderSession = founderPayload.session.token;
        const nextGroupId = founderPayload.group.id;

        setFounderSession(nextFounderSession);
        setMemberSession(nextFounderSession);
        setGroupId(nextGroupId);
        setInviteCode(founderPayload.group.invite_code);
        setIsFounder(true);
        setOnboardingStep('founder_setup');
        return;
      }

      if (!inviteCodeInput.trim()) throw new Error('Enter invite code');

      const preview = await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/invites/${inviteCodeInput.trim()}/preview`,
        method: 'GET'
      });
      setAvailableJoinColors(preview.available_chip_colors || []);
      if (!(preview.available_chip_colors || []).includes(selectedChipColor)) {
        throw new Error('That color is already taken in this group. Choose another.');
      }

      const joinerSession = await createAnonymousSession();
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/invites/${inviteCodeInput.trim()}/join`,
        method: 'POST',
        sessionToken: joinerSession,
        body: { display_name: displayName.trim(), leave_current_group: true, chip_color: selectedChipColor }
      });

      const homePayload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: joinerSession
      });

      setMemberSession(joinerSession);
      setHomeSnapshot(homePayload);
      setGroupId(homePayload.group.id);
      setInviteCode(inviteCodeInput.trim().toUpperCase());
      setOnboardingStep('choose_library');
    });

  const completeFounderSetup = () =>
    run('run founder setup', async () => {
      if (!founderSession || !groupId) throw new Error('Start founder onboarding first');
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/canonical/import`,
        method: 'POST',
        sessionToken: founderSession,
        body: { screenshot_count: 4 }
      });
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/canonical/confirm`,
        method: 'POST',
        sessionToken: founderSession
      });
      setOnboardingStep('choose_library');
    });

  const importPersonal = () =>
    run('upload and parse screenshots', async () => {
      if (!memberSession) throw new Error('Start onboarding first');
      const count = Number.parseInt(screenshotCount, 10);
      if (!Number.isFinite(count) || count < 1 || count > 30) {
        throw new Error('Screenshot count must be between 1 and 30');
      }

      await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/personal/import',
        method: 'POST',
        sessionToken: memberSession,
        body: { screenshot_count: count }
      });

      const review = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/personal/review',
        method: 'GET',
        sessionToken: memberSession
      });

      setPersonalSets(review.sets || []);
      setOnboardingStep('review');
    });

  const refreshPersonal = () =>
    run('refresh my schedule', async () => {
      if (!memberSession) throw new Error('Need session first');
      const review = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/personal/review',
        method: 'GET',
        sessionToken: memberSession
      });
      setPersonalSets(review.sets || []);
    });

  const setPreference = (canonicalSetId, preference) =>
    run(`set ${preference}`, async () => {
      if (!memberSession) throw new Error('Need session first');
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/members/me/sets/${canonicalSetId}`,
        method: 'PATCH',
        sessionToken: memberSession,
        body: { preference }
      });
      setPersonalSets((prev) =>
        prev.map((setItem) =>
          setItem.canonical_set_id === canonicalSetId ? { ...setItem, preference } : setItem
        )
      );
    });

  const setAllMustSee = () =>
    run('set all must-see', async () => {
      if (!memberSession) throw new Error('Need session first');
      if (!personalSets.length) throw new Error('No sets loaded yet');

      await Promise.all(personalSets.map((setItem) => apiRequest({
          baseUrl: apiUrl,
          path: `/v1/members/me/sets/${setItem.canonical_set_id}`,
          method: 'PATCH',
          sessionToken: memberSession,
          body: { preference: 'must_see' }
        })));

      setPersonalSets((prev) => prev.map((setItem) => ({ ...setItem, preference: 'must_see' })));
    });

  const fetchSchedule = async (sessionToken, targetGroupId, filters) => {
    const query = new URLSearchParams();
    if ((filters.memberIds || []).length) query.set('member_ids', filters.memberIds.join(','));
    const suffix = query.toString() ? `?${query.toString()}` : '';

    return apiRequest({
      baseUrl: apiUrl,
      path: `/v1/groups/${targetGroupId}/schedule${suffix}`,
      method: 'GET',
      sessionToken
    });
  };

  const applyScheduleFilters = (nextSelectedMemberIds, options = {}) => {
    const { debounceMs = 0 } = options;

    setSelectedMemberIds(nextSelectedMemberIds);
    setActiveView('group');
    setMenuOpen(false);

    if (scheduleFilterTimeoutRef.current) {
      clearTimeout(scheduleFilterTimeoutRef.current);
      scheduleFilterTimeoutRef.current = null;
    }

    const requestId = scheduleRequestIdRef.current + 1;
    scheduleRequestIdRef.current = requestId;

    const execute = async () => {
      if (!memberSession || !groupId) {
        const msg = 'Need group and member session first';
        setError(msg);
        appendLog(`ERR: apply schedule filters -> ${msg}`);
        return;
      }

      setLoading(true);
      setError('');
      try {
        const payload = await fetchSchedule(memberSession, groupId, {
          memberIds: nextSelectedMemberIds
        });
        if (scheduleRequestIdRef.current !== requestId) return;
        setScheduleSnapshot(payload);
        appendLog('OK: apply schedule filters');
      } catch (err) {
        if (scheduleRequestIdRef.current !== requestId) return;
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        appendLog(`ERR: apply schedule filters -> ${msg}`);
      } finally {
        if (scheduleRequestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    };

    if (debounceMs > 0) {
      scheduleFilterTimeoutRef.current = setTimeout(execute, debounceMs);
      return;
    }

    execute();
  };

  const loadSchedule = () =>
    applyScheduleFilters(selectedMemberIds);

  const loadIndividual = () =>
    run('load individual schedules', async () => {
      if (!memberSession || !groupId) throw new Error('Need group and member session first');
      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/individual-schedules`,
        method: 'GET',
        sessionToken: memberSession
      });
      setIndividualSnapshot(payload);
      setActiveView('individual');
      setMenuOpen(false);
    });

  const finishOnboarding = () =>
    run('confirm setup and open schedule', async () => {
      if (!memberSession) throw new Error('Need member session first');

      await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/setup/complete',
        method: 'POST',
        sessionToken: memberSession,
        body: { confirm: true }
      });

      const homePayload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: memberSession
      });

      const nextGroupId = homePayload.group.id;
      setHomeSnapshot(homePayload);
      setGroupId(nextGroupId);

      const schedulePayload = await fetchSchedule(memberSession, nextGroupId, {
        memberIds: []
      });

      setSelectedMemberIds([]);
      setScheduleSnapshot(schedulePayload);
      setOnboardingStep('complete');
      setActiveView('group');
      setMenuOpen(false);
    });

  const openEditSchedule = () => {
    setActiveView('edit');
    setMenuOpen(false);
    if (!personalSets.length) {
      refreshPersonal();
    }
  };

  const rerunFounderCanonical = () =>
    run('rerun founder canonical setup', async () => {
      if (!isFounder || !founderSession || !groupId) throw new Error('Founder session required');

      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/canonical/import`,
        method: 'POST',
        sessionToken: founderSession,
        body: { screenshot_count: 4 }
      });
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/canonical/confirm`,
        method: 'POST',
        sessionToken: founderSession
      });
    });

  const runSimulatorDemoFlow = () =>
    run('run simulator demo flow', async () => {
      clearSessionData();

      const founderPayload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/groups',
        method: 'POST',
        // Keep the founder identity fixed for deterministic demo screenshots/logs.
        body: { group_name: groupName.trim(), display_name: 'Priyanka', chip_color: CHIP_COLOR_OPTIONS[0] }
      });

      const nextFounderSession = founderPayload.session.token;
      const nextInviteCode = founderPayload.group.invite_code;
      const nextGroupId = founderPayload.group.id;

      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${nextGroupId}/canonical/import`,
        method: 'POST',
        sessionToken: nextFounderSession,
        body: { screenshot_count: 4 }
      });
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${nextGroupId}/canonical/confirm`,
        method: 'POST',
        sessionToken: nextFounderSession
      });

      const memberNames = [
        displayName.trim() || 'Alex',
        'Maya',
        'Jordan',
        'Chris',
        'Riley',
        'Noah',
        'Zoe',
        'Leo',
        'Ava',
        'Milo',
        'Nina'
      ];
      const importedMemberCount = 10; // 10 uploaded schedules + founder + 1 no-upload joiner = 12 attendees total
      const createdMembers = [];

      for (const name of memberNames) {
        const memberSessionToken = await createAnonymousSession();
        await apiRequest({
          baseUrl: apiUrl,
          path: `/v1/invites/${nextInviteCode}/join`,
          method: 'POST',
          sessionToken: memberSessionToken,
          body: {
            display_name: name,
            leave_current_group: true,
            chip_color: CHIP_COLOR_OPTIONS[(createdMembers.length + 1) % CHIP_COLOR_OPTIONS.length]
          }
        });
        createdMembers.push({ name, sessionToken: memberSessionToken });
      }

      const count = Number.parseInt(screenshotCount, 10);
      if (!Number.isFinite(count) || count < 1 || count > 30) {
        throw new Error('Screenshot count must be between 1 and 30');
      }

      let primaryReview = { sets: [] };
      const nextMemberSession = createdMembers[0].sessionToken;
      for (let idx = 0; idx < createdMembers.length; idx += 1) {
        const member = createdMembers[idx];
        if (idx >= importedMemberCount) {
          continue; // keep two attendees without uploaded schedules
        }

        await apiRequest({
          baseUrl: apiUrl,
          path: '/v1/members/me/personal/import',
          method: 'POST',
          sessionToken: member.sessionToken,
          body: { screenshot_count: Math.min(30, count + (idx % 3)) }
        });

        const review = await apiRequest({
          baseUrl: apiUrl,
          path: '/v1/members/me/personal/review',
          method: 'GET',
          sessionToken: member.sessionToken
        });

        // Mark part of each person's sets as must-see for richer overlap/filter behavior.
        for (const setItem of (review.sets || []).slice(0, 3 + (idx % 2))) {
          await apiRequest({
            baseUrl: apiUrl,
            path: `/v1/members/me/sets/${setItem.canonical_set_id}`,
            method: 'PATCH',
            sessionToken: member.sessionToken,
            body: { preference: 'must_see' }
          });
        }

        await apiRequest({
          baseUrl: apiUrl,
          path: '/v1/members/me/setup/complete',
          method: 'POST',
          sessionToken: member.sessionToken,
          body: { confirm: true }
        });

        if (idx === 0) {
          primaryReview = await apiRequest({
            baseUrl: apiUrl,
            path: '/v1/members/me/personal/review',
            method: 'GET',
            sessionToken: member.sessionToken
          });
        }
      }

      const homePayload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: nextMemberSession
      });

      const schedulePayload = await fetchSchedule(nextMemberSession, nextGroupId, {
        memberIds: []
      });

      setFounderSession(nextFounderSession);
      setMemberSession(nextMemberSession);
      setGroupId(nextGroupId);
      setInviteCode(nextInviteCode);
      setIsFounder(false);
      setHomeSnapshot(homePayload);
      setPersonalSets(
        primaryReview.sets || []
      );
      setSelectedMemberIds([]);
      setScheduleSnapshot(schedulePayload);
      setOnboardingStep('complete');
      setActiveView('group');
      setMenuOpen(false);
    });

  const resetFlow = () => {
    clearSessionData();
    setUserRole('member');
    setOnboardingStep('welcome');
    setActiveView('onboarding');
    setMenuOpen(false);
    setSelectedChipColor(CHIP_COLOR_OPTIONS[0]);
    setAvailableJoinColors([]);
    setError('');
    appendLog('Reset: onboarding restarted');
  };

  const canOpenMenu = onboardingStep === 'complete';
  const title = useMemo(() => {
    if (activeView === 'group') return 'Group Schedule';
    if (activeView === 'individual') return 'Individual Schedules';
    if (activeView === 'edit') return 'Edit My Schedule';
    if (activeView === 'founder') return 'Founder Tools';
    return 'Festival Together';
  }, [activeView]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>Coachella coordination app demo</Text>
        </View>
        {canOpenMenu ? (
          <Pressable onPress={() => setMenuOpen((prev) => !prev)} style={styles.menuButton}>
            <Text style={styles.menuButtonText}>☰</Text>
          </Pressable>
        ) : null}
      </View>

      {activeView === 'onboarding' ? (
        <SetupScreen
          userRole={userRole}
          onboardingStep={onboardingStep}
          displayName={displayName}
          setDisplayName={setDisplayName}
          groupName={groupName}
          setGroupName={setGroupName}
          inviteCodeInput={inviteCodeInput}
          setInviteCodeInput={setInviteCodeInput}
          inviteCode={inviteCode}
          selectedChipColor={selectedChipColor}
          setSelectedChipColor={setSelectedChipColor}
          chipColorOptions={CHIP_COLOR_OPTIONS}
          availableJoinColors={availableJoinColors}
          personalSets={personalSets}
          loading={loading}
          error={error}
          log={log}
          onBeginProfile={beginProfile}
          onCompleteFounderSetup={completeFounderSetup}
          onImportPersonal={importPersonal}
          onSetPreference={setPreference}
          onContinueFromReview={() => setOnboardingStep('confirm')}
          onFinishOnboarding={finishOnboarding}
          onRunSimulatorDemoFlow={runSimulatorDemoFlow}
          onResetFlow={resetFlow}
          onChoosePath={choosePath}
        />
      ) : null}

      {activeView === 'group' ? (
        <GroupScheduleScreen
          homeSnapshot={homeSnapshot}
          scheduleSnapshot={scheduleSnapshot}
          selectedMemberIds={selectedMemberIds}
          loading={loading}
          onToggleMember={(memberId) => {
            const nextMemberIds = selectedMemberIds.includes(memberId)
              ? selectedMemberIds.filter((id) => id !== memberId)
              : [...selectedMemberIds, memberId];
            applyScheduleFilters(nextMemberIds, { debounceMs: 300 });
          }}
          onResetFilters={() => applyScheduleFilters([], { debounceMs: 300 })}
        />
      ) : null}

      {activeView === 'individual' ? (
        <IndividualSchedulesScreen
          individualSnapshot={individualSnapshot}
          onLoadIndividual={loadIndividual}
        />
      ) : null}

      {activeView === 'edit' ? (
        <EditMyScheduleScreen
          personalSets={personalSets}
          screenshotCount={screenshotCount}
          setScreenshotCount={setScreenshotCount}
          loading={loading}
          onImportPersonal={importPersonal}
          onRefreshPersonal={refreshPersonal}
          onSetAllMustSee={setAllMustSee}
          onSetPreference={setPreference}
        />
      ) : null}

      {activeView === 'founder' ? (
        <FounderToolsScreen
          inviteCode={inviteCode}
          groupName={homeSnapshot?.group?.name || groupName}
          loading={loading}
          onRerunCanonical={rerunFounderCanonical}
          onOpenSchedule={() => setActiveView('group')}
        />
      ) : null}

      {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

      {menuOpen ? (
        <Pressable style={styles.menuOverlay} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.menuCard} onPress={() => {}}>
            <Text style={styles.menuLabel}>Navigate</Text>
            <MenuItem label="Group Schedule" onPress={() => { setActiveView('group'); setMenuOpen(false); }} />
            <MenuItem label="Individual Schedules" onPress={loadIndividual} />
            <MenuItem label="Edit My Schedule" onPress={openEditSchedule} />
            {isFounder ? (
              <MenuItem label="Founder Tools" onPress={() => { setActiveView('founder'); setMenuOpen(false); }} />
            ) : null}
            <MenuItem label="Restart Onboarding" onPress={resetFlow} />
          </Pressable>
        </Pressable>
      ) : null}

    </SafeAreaView>
  );
}

function MenuItem({ label, onPress }) {
  return (
    <Pressable onPress={onPress} style={styles.menuItem}>
      <Text style={styles.menuItemText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f3ecde'
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1f2c23'
  },
  subtitle: {
    marginTop: 2,
    color: '#4b5a4f',
    fontSize: 12
  },
  menuButton: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#a88f73',
    backgroundColor: '#fff8ee',
    alignItems: 'center',
    justifyContent: 'center'
  },
  menuButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#36463b'
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
    backgroundColor: '#ffe7e7',
    borderWidth: 1,
    borderColor: '#df9e9e',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#8a1d1d',
    fontWeight: '600'
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20, 20, 20, 0.25)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 60,
    paddingRight: 12
  },
  menuCard: {
    width: 230,
    borderRadius: 14,
    backgroundColor: '#fffdf7',
    borderWidth: 1,
    borderColor: '#d8c3a7',
    padding: 10,
    gap: 6
  },
  menuLabel: {
    color: '#6a5a47',
    fontWeight: '700',
    fontSize: 12,
    paddingHorizontal: 8,
    paddingTop: 2,
    paddingBottom: 4
  },
  menuItem: {
    borderWidth: 1,
    borderColor: '#deceb9',
    borderRadius: 10,
    backgroundColor: '#fff9f0',
    paddingHorizontal: 10,
    paddingVertical: 9
  },
  menuItemText: {
    color: '#304036',
    fontWeight: '700'
  }
});
