import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text } from 'react-native';

import { apiRequest } from './src/api/client';
import { Tabs } from './src/components/Tabs';
import { GroupScheduleScreen } from './src/screens/GroupScheduleScreen';
import { IndividualSchedulesScreen } from './src/screens/IndividualSchedulesScreen';
import { SetupScreen } from './src/screens/SetupScreen';

const DEFAULT_API_URL = 'http://127.0.0.1:8000';

export default function App() {
  const [activeTab, setActiveTab] = useState('setup');
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [log, setLog] = useState([]);

  const [founderName, setFounderName] = useState('Priyanka');
  const [groupName, setGroupName] = useState('Festival Together Crew');
  const [memberName, setMemberName] = useState('Alex');
  const [screenshotCount, setScreenshotCount] = useState('3');

  const [founderSession, setFounderSession] = useState('');
  const [memberSession, setMemberSession] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [groupId, setGroupId] = useState('');

  const [personalSets, setPersonalSets] = useState([]);
  const [homeSnapshot, setHomeSnapshot] = useState(null);
  const [scheduleSnapshot, setScheduleSnapshot] = useState(null);
  const [individualSnapshot, setIndividualSnapshot] = useState(null);

  const [mustSeeOnly, setMustSeeOnly] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);

  const appendLog = (line) => setLog((prev) => [line, ...prev].slice(0, 16));

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

  const createFounderGroup = () =>
    run('create founder group', async () => {
      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/groups',
        method: 'POST',
        body: { group_name: groupName.trim(), display_name: founderName.trim() }
      });
      setFounderSession(payload.session.token);
      setInviteCode(payload.group.invite_code);
      setGroupId(payload.group.id);
      setHomeSnapshot(null);
      setScheduleSnapshot(null);
      setIndividualSnapshot(null);
      setPersonalSets([]);
    });

  const completeFounderCanonicalSetup = () =>
    run('founder canonical setup', async () => {
      if (!founderSession || !groupId) throw new Error('Create founder group first');
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

  const createJoinerAndJoin = () =>
    run('create joiner and join group', async () => {
      if (!inviteCode) throw new Error('Need invite code first');

      const joiner = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/groups',
        method: 'POST',
        body: { group_name: 'Temporary Group', display_name: memberName.trim() }
      });
      const newMemberSession = joiner.session.token;

      await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/invites/${inviteCode}/join`,
        method: 'POST',
        sessionToken: newMemberSession,
        body: { display_name: memberName.trim(), leave_current_group: true }
      });

      setMemberSession(newMemberSession);
    });

  const importPersonal = () =>
    run('import personal screenshots', async () => {
      if (!memberSession) throw new Error('Need member session first');
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
    });

  const setAllMustSee = () =>
    run('set all as must-see', async () => {
      if (!memberSession) throw new Error('Need member session first');
      if (!personalSets.length) throw new Error('Import personal sets first');

      for (const setItem of personalSets) {
        await apiRequest({
          baseUrl: apiUrl,
          path: `/v1/members/me/sets/${setItem.canonical_set_id}`,
          method: 'PATCH',
          sessionToken: memberSession,
          body: { preference: 'must_see' }
        });
      }

      const review = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/personal/review',
        method: 'GET',
        sessionToken: memberSession
      });
      setPersonalSets(review.sets || []);
    });

  const completeMemberSetup = () =>
    run('complete member setup', async () => {
      if (!memberSession) throw new Error('Need member session first');
      await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/setup/complete',
        method: 'POST',
        sessionToken: memberSession,
        body: { confirm: true }
      });
    });

  const loadHome = () =>
    run('load home snapshot', async () => {
      if (!memberSession) throw new Error('Need member session first');
      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: '/v1/members/me/home',
        method: 'GET',
        sessionToken: memberSession
      });
      setHomeSnapshot(payload);
      if (!selectedMemberIds.length) {
        setSelectedMemberIds([]);
      }
    });

  const loadSchedule = () =>
    run('load schedule snapshot', async () => {
      if (!memberSession || !groupId) throw new Error('Need group and member session first');

      const query = new URLSearchParams();
      if (mustSeeOnly) query.set('must_see_only', 'true');
      if (selectedMemberIds.length) query.set('member_ids', selectedMemberIds.join(','));
      const suffix = query.toString() ? `?${query.toString()}` : '';

      const payload = await apiRequest({
        baseUrl: apiUrl,
        path: `/v1/groups/${groupId}/schedule${suffix}`,
        method: 'GET',
        sessionToken: memberSession
      });
      setScheduleSnapshot(payload);
      setActiveTab('group');
    });

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
      setActiveTab('individual');
    });

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Festival Together</Text>
        <Text style={styles.subtitle}>Mobile dev flow with setup + schedule tabs.</Text>

        <Tabs activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === 'setup' ? (
          <SetupScreen
            apiUrl={apiUrl}
            setApiUrl={setApiUrl}
            founderName={founderName}
            setFounderName={setFounderName}
            groupName={groupName}
            setGroupName={setGroupName}
            memberName={memberName}
            setMemberName={setMemberName}
            screenshotCount={screenshotCount}
            setScreenshotCount={setScreenshotCount}
            inviteCode={inviteCode}
            founderSession={founderSession}
            memberSession={memberSession}
            personalSets={personalSets}
            homeSnapshot={homeSnapshot}
            loading={loading}
            error={error}
            log={log}
            onCreateFounderGroup={createFounderGroup}
            onCompleteFounderCanonicalSetup={completeFounderCanonicalSetup}
            onCreateJoinerAndJoin={createJoinerAndJoin}
            onImportPersonal={importPersonal}
            onSetAllMustSee={setAllMustSee}
            onCompleteMemberSetup={completeMemberSetup}
            onLoadHome={loadHome}
          />
        ) : null}

        {activeTab === 'group' ? (
          <GroupScheduleScreen
            homeSnapshot={homeSnapshot}
            scheduleSnapshot={scheduleSnapshot}
            mustSeeOnly={mustSeeOnly}
            selectedMemberIds={selectedMemberIds}
            onToggleMustSee={() => setMustSeeOnly((prev) => !prev)}
            onToggleMember={(memberId) =>
              setSelectedMemberIds((prev) =>
                prev.includes(memberId) ? prev.filter((id) => id !== memberId) : [...prev, memberId]
              )
            }
            onResetFilters={() => {
              setMustSeeOnly(false);
              setSelectedMemberIds([]);
            }}
            onLoadSchedule={loadSchedule}
          />
        ) : null}

        {activeTab === 'individual' ? (
          <IndividualSchedulesScreen
            individualSnapshot={individualSnapshot}
            onLoadIndividual={loadIndividual}
          />
        ) : null}
      </ScrollView>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f0e7'
  },
  content: {
    padding: 16,
    paddingBottom: 28
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#222'
  },
  subtitle: {
    marginTop: 4,
    color: '#4c4c4c',
    lineHeight: 20
  }
});
