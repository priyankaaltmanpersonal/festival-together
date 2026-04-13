import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from './src/theme';
import { ActivityIndicator, Alert, AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { apiRequest } from './src/api/client';
import { BottomTabBar } from './src/components/BottomTabBar';
import { MoreSheet } from './src/components/MoreSheet';
import { EditMyScheduleScreen } from './src/screens/EditMyScheduleScreen';
import { FounderToolsScreen } from './src/screens/FounderToolsScreen';
import { GroupScheduleScreen } from './src/screens/GroupScheduleScreen';
import { IndividualSchedulesScreen } from './src/screens/IndividualSchedulesScreen';
import { PrivacyScreen } from './src/screens/PrivacyScreen';
import { SetupScreen } from './src/screens/SetupScreen';
import { clearOfflineState, loadAppState, loadMutationQueue, saveAppState, saveMutationQueue } from './src/state/offlineStore';
import { pickImages, uploadImages } from './src/services/uploadImages';

const DEFAULT_API_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://127.0.0.1:8000';

const API_ERROR_MESSAGES = {
  invalid_chip_color: 'That color isn\'t valid. Please choose a different color.',
  chip_color_unavailable: 'That color was just taken. Please choose another.',
  no_chip_colors_available: 'All colors are taken in this group. Ask someone to leave so a slot opens.',
  session_rate_limited: 'Too many attempts. Please wait a moment and try again.',
  invalid_session: 'Your session has expired. Please restart the app.',
  missing_session: 'Your session has expired. Please restart the app.',
  invite_not_found: 'That invite code wasn\'t found. Double-check the code and try again.',
  setup_pending: 'This group\'s setup isn\'t complete yet. Ask the founder to finish setup.',
  already_in_group: 'You\'re already in a group.',
  founder_cannot_leave: 'The group founder can\'t leave — delete the group instead.',
  group_not_found: 'Group not found.',
  no_parsed_sets: 'No artists could be found in that screenshot. Try a clearer image.',
  all_images_failed: 'That image couldn\'t be read. Please try a clearer screenshot.',
  too_many_images: 'Too many images at once — please upload up to 5 at a time.',
  canonical_not_ready: 'The group schedule isn\'t ready yet. Try again in a moment.',
  canonical_not_imported: 'No schedule has been imported for this group yet.',
  offline_unavailable: 'You appear to be offline. Please check your connection and try again.',
  forbidden: 'You don\'t have permission to do that.',
  founder_only: 'Only the group founder can do that.',
  already_in_schedule: 'You already have this artist on your schedule.',
  no_updates_provided: 'No changes were made.',
};

function friendlyError(msg) {
  return API_ERROR_MESSAGES[msg] || msg;
}
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
  '#9A4FB5',
  '#E84F6B',
  '#F0C040',
  '#00B4D8',
  '#FF6B35',
  '#06A77D',
  '#7B2D8B'
];

export default function App() {
  const C = useTheme();
  const scheduleFilterTimeoutRef = useRef(null);
  const scheduleRequestIdRef = useRef(0);
  const queueRef = useRef([]);
  const sessionRef = useRef('');
  const groupIdRef = useRef('');
  const hydrationDoneRef = useRef(false);

  const [activeView, setActiveView] = useState('onboarding');
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  const apiUrl = DEFAULT_API_URL;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState('');
  const [pendingMutations, setPendingMutations] = useState([]);

  const [userRole, setUserRole] = useState('member');
  const [displayName, setDisplayName] = useState('');
  const [groupName, setGroupName] = useState('');
  const [inviteCodeInput, setInviteCodeInput] = useState('');
  const [screenshotCount, setScreenshotCount] = useState('3');
  const [onboardingStep, setOnboardingStep] = useState('welcome');
  const [selectedChipColor, setSelectedChipColor] = useState(CHIP_COLOR_OPTIONS[0]);
  const [availableJoinColors, setAvailableJoinColors] = useState([]);

  const [memberSession, setMemberSession] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [groupId, setGroupId] = useState('');
  const [isFounder, setIsFounder] = useState(false);

  const [personalSets, setPersonalSets] = useState([]);
  const [homeSnapshot, setHomeSnapshot] = useState(null);
  const [scheduleSnapshot, setScheduleSnapshot] = useState(null);
  const [individualSnapshot, setIndividualSnapshot] = useState(null);

  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [festivalDays, setFestivalDays] = useState([{ dayIndex: 1, label: '' }]);

  const [uploadDayIndex, setUploadDayIndex] = useState(1);
  // { [dayIndex]: { status: 'idle'|'uploading'|'done'|'failed', sets: [], retryCount: 0, imageUris: null } }
  const [dayStates, setDayStates] = useState({});
  const [onboardingLineupState, setOnboardingLineupState] = useState('idle'); // 'idle' | 'uploading' | 'done' | 'error'
  const [onboardingLineupResult, setOnboardingLineupResult] = useState(null); // { sets_created, days_processed } | null
  const [editInitialDay, setEditInitialDay] = useState(null);
  const [editUploadingDayIndex, setEditUploadingDayIndex] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

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
    if (activeView !== 'edit') setEditInitialDay(null);
  }, [activeView]);

  useEffect(() => {
    let alive = true;
    loadAppState()
      .then((storedState) => {
        if (!alive || !storedState) return;
        // If the user has a session and the server confirmed setup complete,
        // always restore to 'complete' regardless of what's in AsyncStorage.
        // This prevents mid-onboarding steps (e.g. 'review_days') from being
        // persisted and trapping users with no nav bar after a bug or crash.
        const hasSession = Boolean(storedState.memberSession);
        const setupComplete = storedState.homeSnapshot?.me?.setup_status === 'complete';
        const forcedComplete = hasSession && setupComplete;
        setActiveView(forcedComplete && storedState.activeView === 'onboarding' ? 'group' : (storedState.activeView || 'onboarding'));
        setMoreSheetOpen(false);
        setUserRole(storedState.userRole || 'member');
        setDisplayName(storedState.displayName || '');
        setGroupName(storedState.groupName || '');
        setInviteCodeInput(storedState.inviteCodeInput || '');
        setScreenshotCount(storedState.screenshotCount || '3');
        setOnboardingStep(forcedComplete ? 'complete' : (storedState.onboardingStep || 'welcome'));
        setSelectedChipColor(storedState.selectedChipColor || CHIP_COLOR_OPTIONS[0]);
        setAvailableJoinColors(storedState.availableJoinColors || []);
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
        setFestivalDays(storedState.festivalDays || [{ dayIndex: 1, label: '' }]);
        setLog(storedState.log || []);
        setLastSyncAt(storedState.lastSyncAt || '');
        setUploadDayIndex(storedState.uploadDayIndex || 1);
        // Convert any in-flight 'uploading' day to 'failed' — uploads can't resume after restart
        const rawDayStates = storedState.dayStates || {};
        const sanitizedDayStates = {};
        for (const [key, val] of Object.entries(rawDayStates)) {
          sanitizedDayStates[key] = val.status === 'uploading'
            ? { ...val, status: 'failed', retryCount: (val.retryCount || 0) + 1, errorMsg: 'Upload may have been interrupted. Tap retry to try again.' }
            : val;
        }
        setDayStates(sanitizedDayStates);
        setOnboardingLineupState(storedState.onboardingLineupState || 'idle');
        setOnboardingLineupResult(storedState.onboardingLineupResult || null);
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
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setDayStates((prev) => {
          const hasInterrupted = Object.values(prev).some((d) => d.status === 'uploading');
          if (!hasInterrupted) return prev;
          const next = {};
          for (const [key, val] of Object.entries(prev)) {
            next[key] = val.status === 'uploading'
              ? { ...val, status: 'failed', retryCount: (val.retryCount || 0) + 1, errorMsg: 'Upload was interrupted. Tap retry to try again.' }
              : val;
          }
          return next;
        });
      }
    });
    return () => sub.remove();
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
      lastSyncAt,
      uploadDayIndex,
      dayStates,
      onboardingLineupState,
      onboardingLineupResult,
    }).catch((err) => {
      console.warn('saveAppState failed:', err);
    });
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
    lastSyncAt,
    uploadDayIndex,
    dayStates,
    onboardingLineupState,
    onboardingLineupResult,
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
        sets: (prev.sets || []).map((setItem) => {
          if (setItem.id !== canonicalSetId) return setItem;
          const updatedAttendees = (setItem.attendees || []).map((attendee) =>
            attendee.member_id === homeSnapshot.me.id ? { ...attendee, preference } : attendee
          );
          return {
            ...setItem,
            attendees: updatedAttendees,
            must_see_count: updatedAttendees.filter((a) => a.preference === 'must_see').length,
          };
        }),
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
      setError(friendlyError(msg));
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
    if (role === 'welcome') {
      setOnboardingStep('welcome');
      return;
    }
    if (role === 'festival_setup') {
      setOnboardingStep('festival_setup');
      return;
    }
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

  const addFestivalDay = () => {
    setFestivalDays((prev) => {
      const nextIndex = prev.length + 1;
      return [...prev, { dayIndex: nextIndex, label: '' }];
    });
  };

  const removeFestivalDay = (dayIndex) => {
    setFestivalDays((prev) => {
      if (prev.length <= 1) return prev; // minimum 1
      const filtered = prev.filter((d) => d.dayIndex !== dayIndex);
      // Reassign sequential indices
      return filtered.map((d, i) => ({ ...d, dayIndex: i + 1 }));
    });
  };

  // ── Upload-all-days flow ─────────────────────────────────────────────────

  const advancePickDay = (currentDayIndex) => {
    const currentIdx = festivalDays.findIndex((d) => d.dayIndex === currentDayIndex);
    const nextDay = festivalDays[currentIdx + 1];
    if (nextDay) {
      setUploadDayIndex(nextDay.dayIndex);
    } else {
      setOnboardingStep('review_days');
    }
  };

  const chooseAndUploadDayScreenshot = async (dayIndex) => {
    if (!memberSession || !isOnline) {
      setError(isOnline ? 'Start onboarding first' : 'Upload requires a connection');
      return;
    }
    let uris;
    try {
      uris = await pickImages(5);
    } catch (e) {
      setError('Photo library permission denied');
      return;
    }
    if (!uris || uris.length === 0) return;

    const currentDay = festivalDays.find((d) => d.dayIndex === dayIndex);
    const dayLabel = currentDay?.label || '';

    setDayStates((prev) => ({
      ...prev,
      [dayIndex]: { status: 'uploading', sets: [], retryCount: 0, imageUris: uris },
    }));
    setError('');

    // Advance to next day immediately (non-blocking upload fires in background)
    advancePickDay(dayIndex);

    uploadImages(apiUrl, '/v1/members/me/personal/upload', memberSession, uris, null, dayLabel)
      .then((response) => {
        const sets = (response.sets || []).map((s) => ({ ...s, preference: 'flexible' }));
        setDayStates((prev) => ({
          ...prev,
          [dayIndex]: { ...prev[dayIndex], status: 'done', sets, errorMsg: null },
        }));
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setDayStates((prev) => ({
          ...prev,
          [dayIndex]: {
            ...prev[dayIndex],
            status: 'failed',
            retryCount: (prev[dayIndex]?.retryCount || 0) + 1,
            errorMsg: friendlyError(msg),
          },
        }));
      });
  };

  const rePickAndUploadDay = async (dayIndex) => {
    if (!memberSession || !isOnline) {
      setError(isOnline ? 'Start onboarding first' : 'Upload requires a connection');
      return;
    }
    let uris;
    try {
      uris = await pickImages(5);
    } catch (e) {
      setError('Photo library permission denied');
      return;
    }
    if (!uris || uris.length === 0) return;

    const currentDay = festivalDays.find((d) => d.dayIndex === dayIndex);
    const dayLabel = currentDay?.label || '';

    setDayStates((prev) => ({
      ...prev,
      [dayIndex]: { status: 'uploading', sets: [], retryCount: 0, imageUris: uris },
    }));
    setError('');

    uploadImages(apiUrl, '/v1/members/me/personal/upload', memberSession, uris, null, dayLabel)
      .then((response) => {
        const sets = (response.sets || []).map((s) => ({ ...s, preference: 'flexible' }));
        setDayStates((prev) => ({
          ...prev,
          [dayIndex]: { ...prev[dayIndex], status: 'done', sets, errorMsg: null },
        }));
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setDayStates((prev) => ({
          ...prev,
          [dayIndex]: {
            ...prev[dayIndex],
            status: 'failed',
            retryCount: (prev[dayIndex]?.retryCount || 0) + 1,
            errorMsg: friendlyError(msg),
          },
        }));
      });
  };

  const retryDayUpload = (dayIndex) => {
    const dayState = dayStates[dayIndex];
    if (!dayState?.imageUris || dayState.status === 'uploading') return;

    const currentDay = festivalDays.find((d) => d.dayIndex === dayIndex);
    const dayLabel = currentDay?.label || '';

    setDayStates((prev) => ({
      ...prev,
      [dayIndex]: { ...prev[dayIndex], status: 'uploading' },
    }));
    setError('');

    uploadImages(apiUrl, '/v1/members/me/personal/upload', memberSession, dayState.imageUris, null, dayLabel)
      .then((response) => {
        const sets = (response.sets || []).map((s) => ({ ...s, preference: 'flexible' }));
        setDayStates((prev) => ({
          ...prev,
          [dayIndex]: { ...prev[dayIndex], status: 'done', sets, errorMsg: null },
        }));
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setDayStates((prev) => ({
          ...prev,
          [dayIndex]: {
            ...prev[dayIndex],
            status: 'failed',
            retryCount: (prev[dayIndex]?.retryCount || 0) + 1,
            errorMsg: friendlyError(msg),
          },
        }));
      });
  };

  const skipPickDay = () => {
    advancePickDay(uploadDayIndex);
  };

  // Post-onboarding re-upload: does NOT touch onboarding state or advance days.
  // Updates personalSets on success so EditMyScheduleScreen reflects results.
  const reUploadDayPostOnboarding = async (dayIndex) => {
    if (!memberSession || !isOnline) {
      setError(isOnline ? 'Start onboarding first' : 'Upload requires a connection');
      return;
    }
    let uris;
    try {
      uris = await pickImages(5);
    } catch (e) {
      setError('Photo library permission denied');
      return;
    }
    if (!uris || uris.length === 0) return;

    const currentDay = festivalDays.find((d) => d.dayIndex === dayIndex);
    const dayLabel = currentDay?.label || '';

    setEditUploadingDayIndex(dayIndex);
    setError('');

    try {
      const response = await uploadImages(apiUrl, '/v1/members/me/personal/upload', memberSession, uris, null, dayLabel);
      if (response.sets && response.sets.length > 0) {
        const myId = homeSnapshot?.me?.id;

        // Optimistically update the group grid immediately — don't wait for a
        // background refresh that could silently fail.
        if (myId) {
          const uploadedIdSet = new Set(response.sets.map((s) => s.canonical_set_id));
          const myAttendee = {
            member_id: myId,
            preference: 'flexible',
            display_name: homeSnapshot.me.display_name || '',
            chip_color: homeSnapshot.me.chip_color || null,
          };
          setScheduleSnapshot((prev) => {
            if (!prev) return prev;
            const existingIds = new Set((prev.sets || []).map((s) => s.id));
            const newSets = response.sets
              .filter((s) => !existingIds.has(s.canonical_set_id))
              .map((s) => ({
                id: s.canonical_set_id,
                artist_name: s.artist_name,
                stage_name: s.stage_name,
                start_time_pt: s.start_time_pt,
                end_time_pt: s.end_time_pt,
                day_index: s.day_index,
                attendees: [myAttendee],
                attendee_count: 1,
                must_see_count: 0,
                popularity_tier: 'low',
                status: 'resolved',
                source: 'member',
              }));
            return {
              ...prev,
              sets: [
                ...(prev.sets || []).map((s) => {
                  if (!uploadedIdSet.has(s.id)) return s;
                  const alreadyIn = (s.attendees || []).some((a) => a.member_id === myId);
                  if (alreadyIn) return s;
                  return {
                    ...s,
                    attendees: [...(s.attendees || []), myAttendee],
                    attendee_count: (s.attendee_count || 0) + 1,
                  };
                }),
                ...newSets,
              ],
            };
          });
        }

        // Sync personalSets in background (Edit My Schedule view)
        refreshPersonal();
      }
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setEditUploadingDayIndex(null);
    }
  };

  const finishUploadFlow = () => {
    run('finish setup', async () => {
      if (Object.values(dayStates).some((d) => d.status === 'uploading')) {
        throw new Error('Uploads are still in progress — please wait before finishing.');
      }
      if (!isOnline) throw new Error('Finish setup requires a connection');
      await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/setup/complete',
        method: 'POST',
        sessionToken: memberSession,
        body: { confirm: true },
      });
      const homePayload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: memberSession,
      });
      const nextGroupId = homePayload.group.id;
      setHomeSnapshot(homePayload);
      setGroupId(nextGroupId);
      const schedulePayload = await fetchSchedule(memberSession, nextGroupId, { memberIds: [] });
      setSelectedMemberIds([]);
      setScheduleSnapshot(schedulePayload);
      setLastSyncAt(new Date().toISOString());
      setOnboardingStep('complete');
      setActiveView('group');
      setMoreSheetOpen(false);
    });
  };

  const deleteDaySet = async (canonicalSetId, dayIndex) => {
    let previousSets;
    setDayStates((prev) => {
      previousSets = prev[dayIndex]?.sets || [];
      return {
        ...prev,
        [dayIndex]: {
          ...prev[dayIndex],
          sets: previousSets.filter((s) => s.canonical_set_id !== canonicalSetId),
        },
      };
    });
    try {
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/members/me/sets/${canonicalSetId}`,
        method: 'DELETE',
        sessionToken: memberSession,
      });
    } catch (err) {
      setDayStates((prev) => ({
        ...prev,
        [dayIndex]: { ...prev[dayIndex], sets: previousSets },
      }));
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  };

  const addDaySet = async (fields, dayIndex) => {
    const data = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/sets',
      method: 'POST',
      sessionToken: memberSession,
      body: fields,
    });
    const newSet = {
      canonical_set_id: data.canonical_set_id,
      artist_name: fields.artist_name,
      stage_name: fields.stage_name,
      start_time_pt: fields.start_time_pt,
      end_time_pt: fields.end_time_pt,
      day_index: dayIndex,
      preference: 'flexible',
    };
    setDayStates((prev) => {
      const prevDay = prev[dayIndex] || {};
      return {
        ...prev,
        [dayIndex]: {
          ...prevDay,
          status: prevDay.status === 'failed' ? 'done' : prevDay.status,
          sets: [...(prevDay.sets || []), newSet],
        },
      };
    });
  };

  const confirmDay = (dayIndex) => {
    setDayStates((prev) => ({
      ...prev,
      [dayIndex]: { ...prev[dayIndex], confirmed: true },
    }));
  };

  const setDaySetPreference = (canonicalSetId, preference, dayIndex) => {
    let previousPref;
    setDayStates((prev) => {
      const set = (prev[dayIndex]?.sets || []).find((s) => s.canonical_set_id === canonicalSetId);
      previousPref = set?.preference;
      return {
        ...prev,
        [dayIndex]: {
          ...prev[dayIndex],
          sets: (prev[dayIndex]?.sets || []).map((s) =>
            s.canonical_set_id === canonicalSetId ? { ...s, preference } : s
          ),
        },
      };
    });
    if (!memberSession || !isOnline) return;
    apiRequest({
      baseUrl: apiUrl,
      path: `/v1/members/me/sets/${canonicalSetId}`,
      method: 'PATCH',
      sessionToken: memberSession,
      body: { preference },
    }).catch(() => {
      setDayStates((prev) => ({
        ...prev,
        [dayIndex]: {
          ...prev[dayIndex],
          sets: (prev[dayIndex]?.sets || []).map((s) =>
            s.canonical_set_id === canonicalSetId ? { ...s, preference: previousPref } : s
          ),
        },
      }));
    });
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
      setFestivalDays((homePayload.festival_days || []).map((d) => ({ dayIndex: d.day_index, label: d.label })));
      setUploadDayIndex((homePayload.festival_days || [{ day_index: 1 }])[0].day_index);
      setDayStates({});
      if (homePayload.group?.has_official_lineup) {
        setOnboardingStep('member_lineup_intro');
      } else {
        setOnboardingStep('upload_all_days');
      }
    });

  const completeFestivalSetup = () =>
    run('create group', async () => {
      if (festivalDays.some((d) => !d.label.trim())) throw new Error('Enter a name for each day');
      if (!isOnline) throw new Error('Creating the group requires a connection');
      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/groups',
        method: 'POST',
        body: {
          group_name: groupName.trim(),
          display_name: displayName.trim(),
          chip_color: selectedChipColor,
          festival_days: festivalDays.map((d) => ({ day_index: d.dayIndex, label: d.label.trim() }))
        }
      });
      setMemberSession(payload.session.token);
      setGroupId(payload.group.id);
      setInviteCode(payload.group.invite_code);
      setIsFounder(true);
      setLastSyncAt(new Date().toISOString());
      setDayStates({});
      setUploadDayIndex(festivalDays[0]?.dayIndex ?? 1);
      setOnboardingStep('upload_official_schedule');
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

  const deletePersonalSet = async (canonicalSetId) => {
    const previousPersonalSets = personalSets;
    const previousScheduleSnapshot = scheduleSnapshot;
    const previousIndividualSnapshot = individualSnapshot;
    const myId = homeSnapshot?.me?.id;

    setPersonalSets((prev) => prev.filter((s) => s.canonical_set_id !== canonicalSetId));

    if (myId && scheduleSnapshot) {
      setScheduleSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sets: (prev.sets || []).map((setItem) => {
            if (setItem.id !== canonicalSetId) return setItem;
            const newAttendees = (setItem.attendees || []).filter((a) => a.member_id !== myId);
            return { ...setItem, attendees: newAttendees, attendee_count: newAttendees.length };
          }),
        };
      });
    }

    if (myId && individualSnapshot) {
      setIndividualSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          members: (prev.members || []).map((member) =>
            member.member_id !== myId
              ? member
              : { ...member, sets: (member.sets || []).filter((s) => s.canonical_set_id !== canonicalSetId) }
          ),
        };
      });
    }

    try {
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/members/me/sets/${canonicalSetId}`,
        method: 'DELETE',
        sessionToken: memberSession,
      });
    } catch (err) {
      setPersonalSets(previousPersonalSets);
      setScheduleSnapshot(previousScheduleSnapshot);
      setIndividualSnapshot(previousIndividualSnapshot);
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  };

  const addPersonalSet = async (fields) => {
    // fields: { artist_name, stage_name, start_time_pt, end_time_pt, day_index }
    const data = await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me/sets',
      method: 'POST',
      sessionToken: memberSession,
      body: fields,
    });
    const newSet = {
      canonical_set_id: data.canonical_set_id,
      artist_name: fields.artist_name,
      stage_name: fields.stage_name,
      start_time_pt: fields.start_time_pt,
      end_time_pt: fields.end_time_pt,
      day_index: fields.day_index,
      preference: 'flexible',
      attendance: 'going',
      source_confidence: 1.0,
    };
    setPersonalSets((prev) => {
      const minutesOf = (t) => {
        const [h, m] = (t || '00:00').split(':').map(Number);
        return (h < 6 ? h + 24 : h) * 60 + m;
      };
      return [...prev, newSet].sort((a, b) => {
        if (a.day_index !== b.day_index) return a.day_index - b.day_index;
        return minutesOf(a.start_time_pt) - minutesOf(b.start_time_pt);
      });
    });
  };

  const addSetFromGrid = async (setItem, preference = 'flexible') => {
    const myId = homeSnapshot?.me?.id;
    const previousScheduleSnapshot = scheduleSnapshot;

    // Optimistic: immediately add ourselves to this set's attendee list so the
    // grid updates without waiting for the round-trip refresh.
    if (myId) {
      setScheduleSnapshot((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          sets: (prev.sets || []).map((s) => {
            if (s.id !== setItem.id) return s;
            const alreadyIn = (s.attendees || []).some((a) => a.member_id === myId);
            if (alreadyIn) return s;
            const newAttendee = {
              member_id: myId,
              preference,
              display_name: homeSnapshot.me.display_name || '',
              chip_color: homeSnapshot.me.chip_color || null,
            };
            return {
              ...s,
              attendees: [...(s.attendees || []), newAttendee],
              attendee_count: (s.attendee_count || 0) + 1,
              must_see_count: preference === 'must_see' ? (s.must_see_count || 0) + 1 : (s.must_see_count || 0),
            };
          }),
        };
      });
    }

    try {
      await addPersonalSet({
        artist_name: setItem.artist_name,
        stage_name: setItem.stage_name,
        start_time_pt: setItem.start_time_pt,
        end_time_pt: setItem.end_time_pt,
        day_index: setItem.day_index,
      });
      // Refresh in the background — don't block so +Must See can chain immediately
      refreshCoreSnapshots().catch(() => {});
    } catch (err) {
      if (myId && previousScheduleSnapshot) {
        setScheduleSnapshot(previousScheduleSnapshot);
      }
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
      throw err;
    }
  };

  const handleRefreshGroup = async () => {
    if (!memberSession || !groupId || refreshing) return;
    setRefreshing(true);
    try {
      await refreshCoreSnapshots();
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRefreshing(false);
    }
  };

  const editCanonicalSet = async (canonicalSetId, fields) => {
    await apiRequest({
      baseUrl: apiUrl,
      path: `/v1/canonical-sets/${canonicalSetId}`,
      method: 'PATCH',
      sessionToken: memberSession,
      body: fields,
    });
    setPersonalSets((prev) =>
      prev.map((s) =>
        s.canonical_set_id === canonicalSetId ? { ...s, ...fields } : s
      )
    );
    setScheduleSnapshot((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        sets: (prev.sets || []).map((setItem) =>
          setItem.canonical_set_id !== canonicalSetId
            ? setItem
            : { ...setItem, ...fields }
        ),
      };
    });
  };

  const applyScheduleFilters = (nextSelectedMemberIds, options = {}) => {
    const { debounceMs = 0 } = options;

    setSelectedMemberIds(nextSelectedMemberIds);
    setActiveView('group');
    setMoreSheetOpen(false);

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

  const [lineupImportState, setLineupImportState] = useState('idle'); // 'idle' | 'uploading' | 'done' | 'error'
  const [lineupImportResult, setLineupImportResult] = useState(null); // { sets_created, days_processed }

  const importOfficialLineup = async () => {
    try {
      const uris = await pickImages(3);
      if (!uris) return; // user cancelled
      setLineupImportState('uploading');
      const result = await uploadImages(
        apiUrl,
        `/v1/groups/${groupId}/lineup/import`,
        memberSession,
        uris,
      );
      setLineupImportResult(result);
      setLineupImportState('done');
      // Refresh home snapshot so has_official_lineup updates
      const homePayload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: memberSession,
      });
      setHomeSnapshot(homePayload);
      // Refresh schedule so newly seeded sets appear
      const schedulePayload = await fetchSchedule(memberSession, groupId, { memberIds: [] });
      setScheduleSnapshot(schedulePayload);
    } catch (err) {
      setLineupImportState('error');
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  };

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
      if (!result.sets_created && (!result.days_processed || result.days_processed.length === 0)) {
        setOnboardingLineupState('error');
        setError('No sets could be imported. Try uploading clearer images.');
        return;
      }
      setOnboardingLineupResult(result);
      setOnboardingLineupState('done');
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

  const handleOnboardingBack = () => {
    if (onboardingStep === 'upload_all_days') {
      const currentIdx = festivalDays.findIndex((d) => d.dayIndex === uploadDayIndex);
      if (currentIdx > 0) {
        setUploadDayIndex(festivalDays[currentIdx - 1].dayIndex);
      } else if (userRole === 'founder') {
        setOnboardingStep('upload_official_schedule');
      } else {
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

  const deleteOfficialLineup = async () => {
    try {
      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/lineup`,
        method: 'DELETE',
        sessionToken: memberSession,
      });
      setLineupImportState('idle');
      setLineupImportResult(null);
      const schedulePayload = await fetchSchedule(memberSession, groupId, { memberIds: [] });
      setScheduleSnapshot(schedulePayload);
      const homePayload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: memberSession,
      });
      setHomeSnapshot(homePayload);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    }
  };

  const loadIndividual = () => {
    setActiveView('individual');
    setMoreSheetOpen(false);
    run('load individual schedules', async () => {
      if (!memberSession || !groupId) throw new Error('Need group and member session first');
      if (!isOnline) {
        if (individualSnapshot) {
          appendLog('OFFLINE: using cached individual schedules');
          return;
        }
        throw new Error('No cached individual schedules available offline');
      }
      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/individual-schedules`,
        method: 'GET',
        sessionToken: memberSession,
      });
      setIndividualSnapshot(payload);
      setLastSyncAt(new Date().toISOString());
    });
  };

  const openEditSchedule = () => {
    setActiveView('edit');
    setMoreSheetOpen(false);
    if (!personalSets.length && isOnline) {
      refreshPersonal();
    }
  };

  const navigateToEditSet = (dayIndex) => {
    setEditInitialDay(dayIndex);
    openEditSchedule();
  };

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

  const deleteMyData = () => {
    Alert.alert(
      'Delete My Data',
      'This permanently removes your account and schedule preferences from our servers. If you are the only member in your group, the group will also be deleted. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            run('delete my data', async () => {
              if (!memberSession) throw new Error('No active session');
              if (!isOnline) throw new Error('Deleting data requires a connection');
              await apiRequest({
                baseUrl: apiUrl,
                path: '/v1/members/me',
                method: 'DELETE',
                sessionToken: memberSession,
                body: { confirm: true }
              });
              await clearSessionData(true);
              setUserRole('member');
              setOnboardingStep('welcome');
              setActiveView('onboarding');
              setMoreSheetOpen(false);
              setSelectedChipColor(CHIP_COLOR_OPTIONS[0]);
              setAvailableJoinColors([]);
            }),
        },
      ]
    );
  };

  const copyInviteCode = async () => {
    if (!inviteCode) return;
    await Clipboard.setStringAsync(inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const updateProfile = async (newDisplayName, newChipColor) => {
    await apiRequest({
      baseUrl: apiUrl,
      path: '/v1/members/me',
      method: 'PATCH',
      sessionToken: memberSession,
      body: { display_name: newDisplayName, chip_color: newChipColor },
    });
    await refreshCoreSnapshots();
  };

  const canOpenMenu = onboardingStep === 'complete';

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

  const autoAdvancedRef = useRef(false);

  useEffect(() => {
    if (allDaysReady && !autoAdvancedRef.current) {
      autoAdvancedRef.current = true;
      finishUploadFlow();
    }
  }, [allDaysReady]);

  useEffect(() => {
    if (onboardingStep !== 'review_days') {
      autoAdvancedRef.current = false;
    }
  }, [onboardingStep]);

  const handleContinueFromReview = () => {
    if (allDaysReady) {
      finishUploadFlow();
      return;
    }

    const failedLabels = festivalDays
      .filter((day) => {
        const s = (dayStates[day.dayIndex] || {}).status;
        return s === 'failed' || s === 'uploading';
      })
      .map((day) => day.label || `Day ${day.dayIndex}`);

    const unconfirmedLabels = festivalDays
      .filter((day) => {
        const state = dayStates[day.dayIndex] || { status: 'idle' };
        return state.status === 'done' && !state.confirmed;
      })
      .map((day) => day.label || `Day ${day.dayIndex}`);

    const parts = [];
    if (failedLabels.length) parts.push(`${failedLabels.join(', ')} ${failedLabels.length === 1 ? 'failed to parse' : 'failed to parse'}.`);
    if (unconfirmedLabels.length) parts.push(`${unconfirmedLabels.join(', ')} ${unconfirmedLabels.length === 1 ? 'hasn\'t been confirmed yet' : 'haven\'t been confirmed yet'}.`);

    Alert.alert(
      'Not all days are ready',
      `${parts.join(' ')} You can always edit your schedule or re-upload screenshots after continuing.`,
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Continue anyway', onPress: () => finishUploadFlow() },
      ]
    );
  };

  const title = useMemo(() => {
    if (activeView === 'group') return homeSnapshot?.group?.name || 'Group Schedule';
    if (activeView === 'individual') return 'Individual Schedules';
    if (activeView === 'edit') return 'Edit My Schedule';
    return 'Festival Together';
  }, [activeView, homeSnapshot]);

  const styles = useMemo(() => makeStyles(C), [C]);
  const statusText = `${isOnline ? 'Online' : 'Offline'}${pendingMutations.length ? ` • ${pendingMutations.length} pending sync` : ''}${lastSyncAt ? ` • synced ${new Date(lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}`;

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <LinearGradient colors={C.gradientHeader} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.title}>{title}</Text>
          {!isOnline ? (
            <View style={styles.offlineDot} />
          ) : pendingMutations.length > 0 ? (
            <View style={styles.pendingDot} />
          ) : null}
        </View>
        {activeView === 'onboarding' && onboardingStep === 'review_days' ? (
          <Pressable onPress={handleContinueFromReview} disabled={loading} style={styles.continueBtn}>
            <Text style={styles.continueBtnText}>›</Text>
          </Pressable>
        ) : null}
        {activeView === 'group' ? (
          <Pressable onPress={handleRefreshGroup} disabled={refreshing} style={styles.refreshBtn}>
            {refreshing ? (
              <ActivityIndicator size="small" color={C.headerText} />
            ) : (
              <Text style={styles.refreshIcon}>↻</Text>
            )}
          </Pressable>
        ) : null}
      </LinearGradient>

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
          selectedChipColor={selectedChipColor}
          setSelectedChipColor={setSelectedChipColor}
          chipColorOptions={CHIP_COLOR_OPTIONS}
          availableJoinColors={availableJoinColors}
          festivalDays={festivalDays}
          setFestivalDayLabel={setFestivalDayLabel}
          onAddFestivalDay={addFestivalDay}
          onRemoveFestivalDay={removeFestivalDay}
          loading={loading}
          error={error}
          onBeginProfile={beginProfile}
          onCompleteFestivalSetup={completeFestivalSetup}
          onResetFlow={resetFlow}
          onChoosePath={choosePath}
          uploadDayIndex={uploadDayIndex}
          dayStates={dayStates}
          onChooseDayScreenshot={chooseAndUploadDayScreenshot}
          onSkipDay={skipPickDay}
          onRetryDay={retryDayUpload}
          onChooseNewImage={rePickAndUploadDay}
          onDeleteDaySet={deleteDaySet}
          onAddDaySet={addDaySet}
          onSetDayPreference={setDaySetPreference}
          onEditDaySet={editCanonicalSet}
          onConfirmDay={confirmDay}
          hasOfficialLineup={Boolean(homeSnapshot?.group?.has_official_lineup)}
          onBrowseFullLineup={finishUploadFlow}
          onboardingLineupState={onboardingLineupState}
          onboardingLineupResult={onboardingLineupResult}
          onImportOfficialSchedule={importOfficialScheduleDuringOnboarding}
          onSkipOfficialSchedule={proceedToPersonalSchedule}
          onFinishSetup={finishUploadFlow}
          onGoBack={handleOnboardingBack}
          onStartOver={handleStartOver}
          onSkipMemberLineupIntro={skipMemberLineupIntro}
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
          inviteCode={inviteCode}
          onCopyInvite={copyInviteCode}
          inviteCopied={inviteCopied}
          myMemberId={homeSnapshot?.me?.id}
          onAddToMySchedule={addSetFromGrid}
          onSetPreferenceFromGrid={setPreference}
          festivalDays={festivalDays}
          onNavigateToEditSet={navigateToEditSet}
          onRemoveFromGrid={deletePersonalSet}
        />
      ) : null}

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
          officialLineupStats={
            homeSnapshot?.group?.has_official_lineup
              ? {
                  set_count: homeSnapshot.group.official_set_count ?? 0,
                  days: homeSnapshot.group.official_days ?? [],
                }
              : null
          }
          festivalDays={festivalDays}
        />
      ) : null}

      {activeView === 'individual' ? (
        <IndividualSchedulesScreen
          individualSnapshot={individualSnapshot}
          festivalDays={festivalDays}
          onLoadIndividual={loadIndividual}
          onBack={() => setActiveView('group')}
        />
      ) : null}

      {activeView === 'edit' ? (
        <EditMyScheduleScreen
          personalSets={personalSets}
          festivalDays={festivalDays}
          onReUploadDay={reUploadDayPostOnboarding}
          uploadingDayIndex={editUploadingDayIndex}
          onSetPreference={setPreference}
          onDeleteSet={deletePersonalSet}
          onAddSet={addPersonalSet}
          onEditSet={editCanonicalSet}
          initialDayIndex={editInitialDay}
        />
      ) : null}

      {canOpenMenu ? (
        <BottomTabBar
          activeView={activeView}
          onNavigate={(view) => {
            if (view === 'edit') {
              openEditSchedule();
            } else {
              setActiveView(view);
            }
          }}
          onOpenMore={() => setMoreSheetOpen(true)}
        />
      ) : null}

      <MoreSheet
        visible={moreSheetOpen}
        onClose={() => setMoreSheetOpen(false)}
        inviteCode={inviteCode}
        inviteCopied={inviteCopied}
        onCopyInvite={copyInviteCode}
        onIndividualSchedules={loadIndividual}
        isFounder={isFounder}
        onFounderTools={() => { setMoreSheetOpen(false); setActiveView('founder'); }}
        onResetApp={resetFlow}
        onDeleteMyData={deleteMyData}
        currentDisplayName={homeSnapshot?.me?.display_name || ''}
        currentChipColor={homeSnapshot?.me?.chip_color || ''}
        chipColorOptions={CHIP_COLOR_OPTIONS}
        takenColors={(homeSnapshot?.members || [])
          .filter((m) => m.id !== homeSnapshot?.me?.id)
          .map((m) => m.chip_color)
          .filter(Boolean)}
        onSaveProfile={updateProfile}
      />
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const makeStyles = (C) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: C.headerText
  },
  offlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.offlineDot,
    marginTop: 2
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.pendingDot,
    marginTop: 2
  },
  errorBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    marginTop: 4,
    backgroundColor: C.errorBg,
    borderWidth: 1,
    borderColor: C.errorBorder,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: C.error,
    fontWeight: '600'
  },
  continueBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    fontSize: 26,
    color: C.headerText,
    fontWeight: '300',
    lineHeight: 28,
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    minWidth: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshIcon: {
    fontSize: 20,
    color: C.headerText,
    fontWeight: '300',
  },
});
