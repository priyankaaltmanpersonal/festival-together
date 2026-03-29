import NetInfo from '@react-native-community/netinfo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { apiRequest } from './src/api/client';
import { EditMyScheduleScreen } from './src/screens/EditMyScheduleScreen';
import { FounderToolsScreen } from './src/screens/FounderToolsScreen';
import { GroupScheduleScreen } from './src/screens/GroupScheduleScreen';
import { IndividualSchedulesScreen } from './src/screens/IndividualSchedulesScreen';
import { PrivacyScreen } from './src/screens/PrivacyScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { clearOfflineState, loadAppState, loadMutationQueue, saveAppState, saveMutationQueue } from './src/state/offlineStore';
import { pickImages, uploadImages } from './src/services/uploadImages';

const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';
const DEFAULT_FESTIVAL_DAYS = [
  { dayIndex: 1, label: 'Friday' },
  { dayIndex: 2, label: 'Saturday' },
  { dayIndex: 3, label: 'Sunday' },
];
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
  const queueRef = useRef([]);
  const sessionRef = useRef('');
  const groupIdRef = useRef('');
  const hydrationDoneRef = useRef(false);

  const [activeView, setActiveView] = useState('onboarding');
  const [menuOpen, setMenuOpen] = useState(false);

  const apiUrl = DEFAULT_API_URL;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [pendingMutations, setPendingMutations] = useState([]);

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
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadFailedCount, setUploadFailedCount] = useState(0);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [festivalDays, setFestivalDays] = useState(DEFAULT_FESTIVAL_DAYS);

  const appendLog = (line) => setLog((prev) => [line, ...prev].slice(0, 16));

  useEffect(() => {
    queueRef.current = pendingMutations;
  }, [pendingMutations]);

  useEffect(() => {
    sessionRef.current = memberSession;
  }, [memberSession]);

  useEffect(() => {
    groupIdRef.current = groupId;
  }, [groupId]);

  useEffect(() => () => {
    if (scheduleFilterTimeoutRef.current) {
      clearTimeout(scheduleFilterTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    loadAppState()
      .then((storedState) => {
        if (!alive || !storedState) return;
        setActiveView(storedState.activeView || 'onboarding');
        setMenuOpen(false);
        setUserRole(storedState.userRole || 'member');
        setDisplayName(storedState.displayName || 'Alex');
        setGroupName(storedState.groupName || 'Festival Together Crew');
        setInviteCodeInput(storedState.inviteCodeInput || '');
        setScreenshotCount(storedState.screenshotCount || '3');
        setOnboardingStep(storedState.onboardingStep || 'welcome');
        setSelectedChipColor(storedState.selectedChipColor || CHIP_COLOR_OPTIONS[0]);
        setAvailableJoinColors(storedState.availableJoinColors || []);
        setFounderSession(storedState.founderSession || '');
        setMemberSession(storedState.memberSession || '');
        setInviteCode(storedState.inviteCode || '');
        setGroupId(storedState.groupId || '');
        setIsFounder(Boolean(storedState.isFounder));
        setPersonalSets(storedState.personalSets || []);
        setHomeSnapshot(storedState.homeSnapshot || null);
        setScheduleSnapshot(storedState.scheduleSnapshot || null);
        setIndividualSnapshot(storedState.individualSnapshot || null);
        setSelectedMemberIds(storedState.selectedMemberIds || []);
        setPrivacyAccepted(Boolean(storedState.privacyAccepted));
        setFestivalDays(storedState.festivalDays || DEFAULT_FESTIVAL_DAYS);
        setLog(storedState.log || []);
        setLastSyncAt(storedState.lastSyncAt || '');
      })
      .finally(() => {
        if (alive) {
          hydrationDoneRef.current = true;
        }
      });

    loadMutationQueue().then((storedQueue) => {
      if (!alive) return;
      setPendingMutations(storedQueue || []);
    });

    const unsubscribe = NetInfo.addEventListener((state) => {
      if (!alive) return;
      const nextOnline = Boolean(state.isConnected) && state.isInternetReachable !== false;
      setIsOnline(nextOnline);
    });

    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!hydrationDoneRef.current) return;
    saveAppState({
      activeView,
      userRole,
      displayName,
      groupName,
      inviteCodeInput,
      screenshotCount,
      onboardingStep,
      selectedChipColor,
      availableJoinColors,
      founderSession,
      memberSession,
      inviteCode,
      groupId,
      isFounder,
      personalSets,
      homeSnapshot,
      scheduleSnapshot,
      individualSnapshot,
      selectedMemberIds,
      privacyAccepted,
      festivalDays,
      log,
      lastSyncAt
    }).catch(() => {});
  }, [
    activeView,
    userRole,
    displayName,
    groupName,
    inviteCodeInput,
    screenshotCount,
    onboardingStep,
    selectedChipColor,
    availableJoinColors,
    founderSession,
    memberSession,
    inviteCode,
    groupId,
    isFounder,
    personalSets,
    homeSnapshot,
    scheduleSnapshot,
    individualSnapshot,
    selectedMemberIds,
    privacyAccepted,
    festivalDays,
    log,
    lastSyncAt
  ]);

  useEffect(() => {
    saveMutationQueue(pendingMutations).catch(() => {});
  }, [pendingMutations]);

  const queueMutation = (mutation) => {
    setPendingMutations((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString(), ...mutation }
    ]);
  };

  const applyPreferenceLocally = (canonicalSetId, preference) => {
    setPersonalSets((prev) =>
      prev.map((setItem) =>
        setItem.canonical_set_id === canonicalSetId ? { ...setItem, preference } : setItem
      )
    );
    setScheduleSnapshot((prev) => {
      if (!prev || !homeSnapshot?.me?.id) return prev;
      return {
        ...prev,
        sets: (prev.sets || []).map((setItem) => ({
          ...setItem,
          attendees: (setItem.attendees || []).map((attendee) =>
            attendee.member_id === homeSnapshot.me.id ? { ...attendee, preference } : attendee
          ),
          must_see_count: (setItem.attendees || []).map((attendee) =>
            attendee.member_id === homeSnapshot.me.id ? { ...attendee, preference } : attendee
          ).filter((attendee) => attendee.preference === 'must_see').length
        }))
      };
    });
    setIndividualSnapshot((prev) => {
      if (!prev || !homeSnapshot?.me?.id) return prev;
      return {
        ...prev,
        members: (prev.members || []).map((member) =>
          member.member_id !== homeSnapshot.me.id
            ? member
            : {
                ...member,
                sets: (member.sets || []).map((setItem) =>
                  setItem.canonical_set_id === canonicalSetId ? { ...setItem, preference } : setItem
                )
              }
        )
      };
    });
  };

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

  const refreshCoreSnapshots = async () => {
    if (!sessionRef.current || !groupIdRef.current) return;
    const [homePayload, schedulePayload] = await Promise.all([
      apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: sessionRef.current
      }),
      fetchSchedule(sessionRef.current, groupIdRef.current, { memberIds: selectedMemberIds })
    ]);
    setHomeSnapshot(homePayload);
    setScheduleSnapshot(schedulePayload);
    setLastSyncAt(new Date().toISOString());
  };

  const flushMutationQueue = async () => {
    if (!isOnline || !queueRef.current.length || !sessionRef.current) return;
    const remaining = [];
    for (const mutation of queueRef.current) {
      try {
        if (mutation.type === 'set_preference') {
          await apiRequest({
            baseUrl: apiUrl,
            path: `/v1/members/me/sets/${mutation.canonicalSetId}`,
            method: 'PATCH',
            sessionToken: sessionRef.current,
            body: { preference: mutation.preference }
          });
        } else {
          remaining.push(mutation);
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'offline_unavailable') {
          remaining.push(mutation);
          break;
        }
        remaining.push(mutation);
      }
    }
    setPendingMutations(remaining);
    if (remaining.length !== queueRef.current.length) {
      await refreshCoreSnapshots();
      appendLog(`OK: synced ${queueRef.current.length - remaining.length} queued change(s)`);
    }
  };

  useEffect(() => {
    if (!isOnline || !pendingMutations.length || !memberSession) return;
    flushMutationQueue().catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      appendLog(`ERR: queue sync -> ${msg}`);
    });
  }, [isOnline, pendingMutations.length, memberSession]);

  const clearSessionData = async (clearPersisted = false) => {
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
    setPendingMutations([]);
    setLastSyncAt('');
    if (clearPersisted) {
      await clearOfflineState().catch(() => {});
    }
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

  const setFestivalDayLabel = (dayIndex, text) => {
    setFestivalDays((prev) => prev.map((d) => d.dayIndex === dayIndex ? { ...d, label: text } : d));
  };

  const beginProfile = () =>
    run('start onboarding', async () => {
      if (!displayName.trim()) throw new Error('Enter your name first');
      if (userRole !== 'founder' && userRole !== 'member') throw new Error('Choose create or join first');
      if (!selectedChipColor) throw new Error('Choose your color first');
      await clearSessionData();

      if (userRole === 'founder') {
        if (!groupName.trim()) throw new Error('Enter group name');
        setOnboardingStep('festival_setup');
        return;
      }

      if (!isOnline) throw new Error('You need a connection to start onboarding');

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
      try {
        await apiRequest({
          baseUrl: apiUrl,
          path: `/v1/invites/${inviteCodeInput.trim()}/join`,
          method: 'POST',
          sessionToken: joinerSession,
          body: { display_name: displayName.trim(), leave_current_group: true, chip_color: selectedChipColor }
        });
      } catch (err) {
        if (err instanceof Error && err.message === 'chip_color_unavailable') {
          const refreshedPreview = await apiRequest({
            baseUrl: apiUrl,
            path: `/v1/invites/${inviteCodeInput.trim()}/preview`,
            method: 'GET'
          });
          setAvailableJoinColors(refreshedPreview.available_chip_colors || []);
          throw new Error('That color was just taken. Choose another.');
        }
        throw err;
      }

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
      setLastSyncAt(new Date().toISOString());
      setOnboardingStep('choose_library');
    });

  const completeFestivalSetup = () =>
    run('create group', async () => {
      if (!isOnline) throw new Error('Creating the group requires a connection');
      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/groups',
        method: 'POST',
        body: {
          group_name: groupName.trim(),
          display_name: displayName.trim(),
          chip_color: selectedChipColor,
          festival_days: festivalDays.map((d) => ({ day_index: d.dayIndex, label: d.label }))
        }
      });
      setFounderSession(payload.session.token);
      setMemberSession(payload.session.token);
      setGroupId(payload.group.id);
      setInviteCode(payload.group.invite_code);
      setIsFounder(true);
      setLastSyncAt(new Date().toISOString());
      setOnboardingStep('choose_library');
    });

  const importPersonal = () =>
    run('upload and parse screenshots', async () => {
      if (!memberSession) throw new Error('Start onboarding first');
      if (!isOnline) throw new Error('Import requires a connection');
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
      setLastSyncAt(new Date().toISOString());
      setOnboardingStep('review');
    });

  const refreshPersonal = () =>
    run('refresh my schedule', async () => {
      if (!memberSession) throw new Error('Need session first');
      if (!isOnline) {
        if (personalSets.length) return;
        throw new Error('No cached schedule available offline');
      }
      const review = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/personal/review',
        method: 'GET',
        sessionToken: memberSession
      });
      setPersonalSets(review.sets || []);
      setLastSyncAt(new Date().toISOString());
    });

  const setPreference = (canonicalSetId, preference) =>
    run(`set ${preference}`, async () => {
      if (!memberSession) throw new Error('Need session first');

      if (!isOnline) {
        applyPreferenceLocally(canonicalSetId, preference);
        queueMutation({ type: 'set_preference', canonicalSetId, preference });
        appendLog(`QUEUED: ${preference} for ${canonicalSetId}`);
        return;
      }

      try {
        await apiRequest({
          baseUrl: apiUrl,
          path: `/v1/members/me/sets/${canonicalSetId}`,
          method: 'PATCH',
          sessionToken: memberSession,
          body: { preference }
        });
        applyPreferenceLocally(canonicalSetId, preference);
        setLastSyncAt(new Date().toISOString());
      } catch (err) {
        if (err instanceof Error && err.message === 'offline_unavailable') {
          applyPreferenceLocally(canonicalSetId, preference);
          queueMutation({ type: 'set_preference', canonicalSetId, preference });
          appendLog(`QUEUED: ${preference} for ${canonicalSetId}`);
          return;
        }
        throw err;
      }
    });

  const setAllMustSee = () =>
    run('set all must-see', async () => {
      if (!memberSession) throw new Error('Need session first');
      if (!personalSets.length) throw new Error('No sets loaded yet');

      if (!isOnline) {
        for (const setItem of personalSets) {
          queueMutation({ type: 'set_preference', canonicalSetId: setItem.canonical_set_id, preference: 'must_see' });
        }
        setPersonalSets((prev) => prev.map((setItem) => ({ ...setItem, preference: 'must_see' })));
        appendLog(`QUEUED: ${personalSets.length} must-see updates`);
        return;
      }

      const results = await Promise.allSettled(
        personalSets.map((setItem) =>
          apiRequest({
            baseUrl: apiUrl,
            path: `/v1/members/me/sets/${setItem.canonical_set_id}`,
            method: 'PATCH',
            sessionToken: memberSession,
            body: { preference: 'must_see' }
          })
        )
      );

      const failedCount = results.filter((result) => result.status === 'rejected').length;
      if (failedCount > 0) {
        const review = await apiRequest({
          baseUrl: apiUrl,
          path: '/v1/members/me/personal/review',
          method: 'GET',
          sessionToken: memberSession
        });
        setPersonalSets(review.sets || []);
        throw new Error(`Updated some sets, but ${failedCount} request${failedCount === 1 ? '' : 's'} failed. Review and retry.`);
      }

      setPersonalSets((prev) => prev.map((setItem) => ({ ...setItem, preference: 'must_see' })));
      setLastSyncAt(new Date().toISOString());
    });

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

      if (!isOnline) {
        appendLog('OFFLINE: using cached group schedule');
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
        setLastSyncAt(new Date().toISOString());
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

  const loadIndividual = () =>
    run('load individual schedules', async () => {
      if (!memberSession || !groupId) throw new Error('Need group and member session first');
      if (!isOnline) {
        if (individualSnapshot) {
          setActiveView('individual');
          setMenuOpen(false);
          appendLog('OFFLINE: using cached individual schedules');
          return;
        }
        throw new Error('No cached individual schedules available offline');
      }
      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/individual-schedules`,
        method: 'GET',
        sessionToken: memberSession
      });
      setIndividualSnapshot(payload);
      setLastSyncAt(new Date().toISOString());
      setActiveView('individual');
      setMenuOpen(false);
    });

  const finishOnboarding = () =>
    run('confirm setup and open schedule', async () => {
      if (!memberSession) throw new Error('Need member session first');
      if (!isOnline) throw new Error('Finish setup requires a connection');

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
      setLastSyncAt(new Date().toISOString());
      setOnboardingStep('complete');
      setActiveView('group');
      setMenuOpen(false);
    });

  const openEditSchedule = () => {
    setActiveView('edit');
    setMenuOpen(false);
    if (!personalSets.length && isOnline) {
      refreshPersonal();
    }
  };

  const rerunFounderCanonical = () =>
    run('rerun founder canonical setup', async () => {
      if (!isFounder || !founderSession || !groupId) throw new Error('Founder session required');
      if (!isOnline) throw new Error('Canonical parse rerun requires a connection');

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
      setLastSyncAt(new Date().toISOString());
    });

  const runSimulatorDemoFlow = () =>
    run('run simulator demo flow', async () => {
      if (!isOnline) throw new Error('Demo flow requires a connection');
      await clearSessionData();

      const founderPayload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/groups',
        method: 'POST',
        body: {
          group_name: groupName.trim(),
          display_name: 'Priyanka',
          chip_color: CHIP_COLOR_OPTIONS[0],
          festival_days: DEFAULT_FESTIVAL_DAYS.map((d) => ({ day_index: d.dayIndex, label: d.label }))
        }
      });

      const nextFounderSession = founderPayload.session.token;
      const nextInviteCode = founderPayload.group.invite_code;
      const nextGroupId = founderPayload.group.id;

      // Seed canonical via legacy import endpoint (demo only), then founder imports
      // personal data and completes setup to open the group for members to join.
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
      await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/personal/import',
        method: 'POST',
        sessionToken: nextFounderSession,
        body: { screenshot_count: 3 }
      });
      await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/setup/complete',
        method: 'POST',
        sessionToken: nextFounderSession,
        body: { confirm: true }
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
      const importedMemberCount = 10;
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
        if (idx >= importedMemberCount) continue;

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
      setPersonalSets(primaryReview.sets || []);
      setSelectedMemberIds([]);
      setScheduleSnapshot(schedulePayload);
      setLastSyncAt(new Date().toISOString());
      setOnboardingStep('complete');
      setActiveView('group');
      setMenuOpen(false);
    });

  const resetFlow = async () => {
    await clearSessionData(true);
    setUserRole('member');
    setOnboardingStep('welcome');
    setActiveView('onboarding');
    setMenuOpen(false);
    setSelectedChipColor(CHIP_COLOR_OPTIONS[0]);
    setAvailableJoinColors([]);
    setError('');
    setLog(['Reset: onboarding restarted']);
  };

  // Shared core: pick images, upload to `endpoint`, fetch personal review, update state.
  // `advanceStep` is called only when the upload produces at least one parsed set.
  const pickAndUploadPersonal = async (endpoint, advanceStep) => {
    if (!memberSession) throw new Error('Start onboarding first');
    if (!isOnline) throw new Error('Upload requires a connection');

    setUploadProgress('');
    setUploadFailedCount(0);

    const uris = await pickImages();
    if (!uris) return;

    const result = await uploadImages(
      apiUrl,
      endpoint,
      sessionRef.current,
      uris,
      (done, total) => setUploadProgress(`Compressing screenshot ${done}/${total}...`)
    );

    setUploadProgress('');
    setUploadFailedCount(result.failed_count || 0);

    if (!result.parsed_count && result.failed_count > 0) {
      // All images failed OCR — stay on current step so the warning is visible
      // and the user can choose to retry or skip.
      throw new Error(`None of the ${result.failed_count} screenshot(s) could be read. Please try clearer images.`);
    }

    const review = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/personal/review',
      method: 'GET',
      sessionToken: sessionRef.current
    });

    setPersonalSets(review.sets || []);
    setLastSyncAt(new Date().toISOString());
    if (advanceStep) advanceStep();
  };

  const chooseScreenshots = () =>
    run('upload my schedule', () =>
      pickAndUploadPersonal('/v1/members/me/personal/upload', () => setOnboardingStep('review'))
    );

  const retryUpload = () =>
    run('upload more screenshots', () =>
      pickAndUploadPersonal('/v1/members/me/personal/upload', null)
    );

  const skipFailed = () => {
    setUploadFailedCount(0);
    setUploadProgress('');
  };

  const canOpenMenu = onboardingStep === 'complete';
  const title = useMemo(() => {
    if (activeView === 'group') return 'Group Schedule';
    if (activeView === 'individual') return 'Individual Schedules';
    if (activeView === 'edit') return 'Edit My Schedule';
    if (activeView === 'founder') return 'Founder Tools';
    return 'Festival Together';
  }, [activeView]);

  const statusText = `${isOnline ? 'Online' : 'Offline'}${pendingMutations.length ? ` • ${pendingMutations.length} pending sync` : ''}${lastSyncAt ? ` • synced ${new Date(lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`;

  return (
    <SafeAreaProvider>
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

      <View style={[styles.statusBar, isOnline ? styles.statusOnline : styles.statusOffline]}>
        <Text style={styles.statusText}>{statusText}</Text>
      </View>

      {/* Privacy screen shown once per install. Intentionally outside the onboardingStep
          state machine so it gates ALL paths (create group and join group) with a single
          persistent flag. Once accepted it is never shown again, even after Restart
          Onboarding — this is intentional: consent survives re-onboarding within the app. */}
      {activeView === 'onboarding' && !privacyAccepted ? (
        <PrivacyScreen onAccept={() => setPrivacyAccepted(true)} />
      ) : null}

      {activeView === 'onboarding' && privacyAccepted ? (
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
          festivalDays={festivalDays}
          setFestivalDayLabel={setFestivalDayLabel}
          personalSets={personalSets}
          loading={loading}
          error={error}
          log={log}
          uploadProgress={uploadProgress}
          failedCount={uploadFailedCount}
          onBeginProfile={beginProfile}
          onCompleteFestivalSetup={completeFestivalSetup}
          onImportPersonal={importPersonal}
          onChooseScreenshots={chooseScreenshots}
          onRetryUpload={retryUpload}
          onSkipFailed={skipFailed}
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
    </SafeAreaProvider>
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
  statusBar: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  statusOnline: {
    backgroundColor: '#eef6ef',
    borderWidth: 1,
    borderColor: '#c4ddc6'
  },
  statusOffline: {
    backgroundColor: '#fff1df',
    borderWidth: 1,
    borderColor: '#e1b882'
  },
  statusText: {
    color: '#304036',
    fontWeight: '700',
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
