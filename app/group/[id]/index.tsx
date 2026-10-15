import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, Switch, Text, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  addComment, createPost, getComments, getGroup, getUser, live, me, moderatePost, subscribeGroup, toggleReaction, votePoll,
  type GroupView,
} from '../../../src/api/connect';
import type { Comment, Post } from '../../../src/comms/types';
import { Button, C, Card, Chip, Loading, P, s } from '../../../src/ui';

const QUICK_REACTIONS = ['👍', '❤️', '🎉', '🙏'];

function Author({ id, anon }: { id: string | null; anon?: boolean }) {
  const u = id ? getUser(id) : null;
  return (
    <View style={s.row}>
      {u && !anon ? <Image source={{ uri: u.avatar }} style={{ width: 28, height: 28, borderRadius: 14 }} /> : <Text>🕶️</Text>}
      <Text style={{ fontWeight: '600', color: C.ink }}>{u && !anon ? `${u.firstName} ${u.lastName}` : 'Anonymous'}</Text>
      {u && !anon && <Text style={{ color: C.muted, fontSize: 12 }}>{u.schoolRole}</Text>}
    </View>
  );
}

function PostCard({ p, view, onChange }: { p: Post & { anonymous?: boolean }; view: GroupView; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState('');
  const [comments, setComments] = useState<Comment[] | null>(null);
  const mod = view.abilities.moderate;
  const myId = me()?.id;
  const loadComments = useCallback(() => getComments(p.id).then(setComments), [p.id]);
  useEffect(() => { if (open) loadComments(); }, [open, loadComments, p]);

  const fail = (e: any) => Alert.alert('Not allowed', e.message);
  const send = () => addComment(p.id, reply).then(() => { setReply(''); loadComments(); onChange(); }).catch(fail);
  const act = (a: Parameters<typeof moderatePost>[1]) => moderatePost(p.id, a).then(onChange).catch(fail);
  const react = (e: string) => toggleReaction(p.id, e).then(onChange).catch(fail);
  const totalVotes = p.poll?.options.reduce((n, o) => n + o.votes.length, 0) ?? 0;

  return (
    <Card>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Author id={p.authorId} anon={p.anonymous} />
        <View style={s.row}>
          {p.pinned && <Chip label="📌 Pinned" />}
          {p.status !== 'published' && <Chip label={p.status} color={p.status === 'pending' ? '#B45309' : C.danger} />}
        </View>
      </View>
      {p.title ? <Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }}>{p.title}</Text> : null}
      {p.body ? <P>{p.body}</P> : null}
      {p.attachments.filter((a) => a.type === 'image').map((a) => <Image key={a.url} source={{ uri: a.url }} style={{ height: 160, borderRadius: 10 }} />)}
      {p.poll && p.poll.options.map((o) => {
        const mine = !!myId && o.votes.includes(myId);
        const pct = totalVotes ? Math.round((o.votes.length / totalVotes) * 100) : 0;
        return (
          <Pressable key={o.id} disabled={!live || !view.abilities.react.allowed} onPress={() => votePoll(o.id).then(onChange).catch(fail)}
            style={{ borderWidth: 1, borderColor: mine ? C.primary : C.line, borderRadius: 10, padding: 10, overflow: 'hidden' }}>
            <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, backgroundColor: C.primary + '14' }} />
            <Text style={{ color: C.ink, fontWeight: mine ? '700' : '400' }}>{mine ? '✓ ' : ''}{o.label} — {o.votes.length} ({pct}%)</Text>
          </Pressable>
        );
      })}
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        {p.score ? <Text style={{ color: C.muted }}>▲ {p.score}</Text> : null}
        {(live && view.abilities.react.allowed ? QUICK_REACTIONS : Object.keys(p.reactions)).map((e) => {
          const ids = p.reactions[e] ?? [];
          const mine = !!myId && ids.includes(myId);
          return (
            <Text key={e} onPress={live ? () => react(e) : undefined}
              style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', backgroundColor: mine ? C.primary + '22' : 'transparent' }}>
              {e} {ids.length || ''}
            </Text>
          );
        })}
        <Text style={{ color: C.primary, fontWeight: '600' }} onPress={() => setOpen(!open)}>
          {open ? 'Hide replies' : 'Replies'}{comments ? ` (${comments.length})` : ''}
        </Text>
      </View>
      {mod && (
        <View style={[s.row, { flexWrap: 'wrap' }]}>
          {p.status === 'pending' && <Text style={{ color: '#047857', fontWeight: '700' }} onPress={() => act('approve')}>Approve</Text>}
          {p.status === 'pending' && <Text style={{ color: C.danger, fontWeight: '700' }} onPress={() => act('reject')}>Reject</Text>}
          <Text style={{ color: C.muted }} onPress={() => act('pin')}>{p.pinned ? 'Unpin' : 'Pin'}</Text>
          <Text style={{ color: C.muted }} onPress={() => act('lockComments')}>{p.commentsLocked ? 'Open replies' : 'Close replies'}</Text>
          <Text style={{ color: C.danger }} onPress={() => act('remove')}>Remove</Text>
        </View>
      )}
      {open && comments && (
        <View style={{ gap: 8, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 8 }}>
          {comments.map((c) => (
            <View key={c.id} style={{ gap: 2, paddingLeft: c.parentCommentId ? 16 : 0 }}>
              <Author id={c.authorId} />
              <P>{c.isAnswer ? '✅ ' : ''}{c.body}</P>
            </View>
          ))}
          {view.abilities.comment.allowed && !p.commentsLocked ? (
            <View style={s.row}>
              <TextInput value={reply} onChangeText={setReply} placeholder="Reply…" style={[s.input, { flex: 1, padding: 8 }]} />
              <Button label="Send" onPress={send} disabled={!reply.trim()} />
            </View>
          ) : <P muted>{p.commentsLocked ? 'Replies are closed.' : view.abilities.comment.reason}</P>}
        </View>
      )}
    </Card>
  );
}

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [view, setView] = useState<GroupView | null>(null);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [anon, setAnon] = useState(false);
  const [poll, setPoll] = useState<string[] | null>(null);

  const reload = useCallback(() => getGroup(id).then(setView).catch((e) => Alert.alert('Could not open group', e.message)), [id]);
  useEffect(() => { reload(); return subscribeGroup(id, reload); }, [id, reload]);
  if (!view) return <Loading />;

  const { group, abilities, posts, myRole } = view;
  const mode = group.settings.mode;
  const isChat = mode === 'chat';
  const asQuestion = !abilities.post.allowed && abilities.askQuestion.allowed;
  const composer = asQuestion ? abilities.askQuestion : abilities.post;
  const pollOptions = poll?.map((o) => o.trim()).filter(Boolean) ?? [];

  const submit = () =>
    createPost(id, {
      kind: asQuestion ? 'question' : poll ? 'poll' : isChat ? 'message' : mode === 'broadcast' ? 'announcement' : 'thread',
      body: text, title: isChat && !poll ? undefined : title, anonymous: anon, pollOptions: poll ? pollOptions : undefined,
    })
      .then((p) => {
        setText(''); setTitle(''); setPoll(null); reload();
        if (p.status === 'pending') Alert.alert('Submitted', 'A moderator will review it before it appears.');
      })
      .catch((e) => Alert.alert('Not allowed', e.message));

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{
        title: group.name,
        headerRight: () => (
          <View style={[s.row, { gap: 14 }]}>
            {live && abilities.moderate && <Pressable onPress={() => router.push(`/group/${id}/members`)}><Text style={{ color: '#fff', fontWeight: '700' }}>Members</Text></Pressable>}
            {abilities.editSettings && <Pressable onPress={() => router.push(`/group/${id}/settings`)}><Text style={{ color: '#fff', fontWeight: '700' }}>Settings</Text></Pressable>}
          </View>
        ),
      }} />
      <FlatList
        data={posts} keyExtractor={(p) => p.id} contentContainerStyle={s.pad}
        ListHeaderComponent={
          <View style={{ gap: 6 }}>
            {!!group.description && <P muted>{group.description}</P>}
            <View style={s.row}>
              <Chip label={`You: ${myRole ?? 'viewer'}`} />
              {group.settings.locked && <Chip label="🔒 Locked" color={C.danger} />}
              {live && <Chip label="● Live" color="#047857" />}
            </View>
          </View>}
        ListEmptyComponent={<P muted>Nothing here yet.</P>}
        renderItem={({ item }) => <PostCard p={item} view={view} onChange={reload} />}
      />
      <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: '#fff', gap: 8 }}>
        {composer.allowed ? (
          <>
            {(!isChat || poll) && <TextInput value={title} onChangeText={setTitle} placeholder={poll ? 'Poll question' : asQuestion ? 'Question title' : 'Title'} style={s.input} />}
            {poll && (
              <View style={{ gap: 6 }}>
                {poll.map((o, i) => (
                  <TextInput key={i} value={o} placeholder={`Option ${i + 1}`} style={s.input}
                    onChangeText={(t) => setPoll(poll.map((x, j) => (j === i ? t : x)))} />
                ))}
                <View style={s.row}>
                  {poll.length < 6 && <Text style={{ color: C.primary, fontWeight: '600' }} onPress={() => setPoll([...poll, ''])}>+ Option</Text>}
                  <Text style={{ color: C.muted }} onPress={() => setPoll(null)}>Cancel poll</Text>
                </View>
              </View>
            )}
            <View style={s.row}>
              <TextInput value={text} onChangeText={setText} multiline placeholder={asQuestion ? 'Ask a question…' : isChat ? 'Message' : 'Write a post…'} style={[s.input, { flex: 1 }]} />
              <Button label={asQuestion ? 'Ask' : 'Post'} onPress={submit}
                disabled={poll ? !title.trim() || pollOptions.length < 2 : !text.trim()} />
            </View>
            {live && !poll && !asQuestion && abilities.createPolls.allowed && (
              <Text style={{ color: C.primary, fontWeight: '600' }} onPress={() => setPoll(['', ''])}>📊 Create a poll</Text>
            )}
            {asQuestion && group.settings.allowAnonymousQuestions && (
              <View style={s.row}><Switch value={anon} onValueChange={setAnon} /><P muted>Ask anonymously</P></View>
            )}
            {composer.needsApproval && <P muted>Posts here are reviewed by a moderator first.</P>}
          </>
        ) : (
          <P muted>🔒 {composer.reason}</P>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
