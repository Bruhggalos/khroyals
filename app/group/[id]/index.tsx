import { useState } from 'react';
import { Alert, FlatList, Image, KeyboardAvoidingView, Platform, Pressable, Switch, TextInput, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { addComment, createPost, getComments, getGroup, getUser, moderatePost } from '../../../src/api/mockApi';
import type { Post } from '../../../src/comms/types';
import { Button, C, Card, Chip, Loading, P, s, Text, useLoad } from '../../../src/ui';

function Author({ id, anon }: { id: string | null; anon?: boolean }) {
  const u = id ? getUser(id) : null;
  return (
    <View style={s.row}>
      {u ? <Image source={{ uri: u.avatar }} style={{ width: 28, height: 28, borderRadius: 14 }} /> : <Text>🕶️</Text>}
      <Text style={{ fontWeight: '600', color: C.ink }}>{u && !anon ? `${u.firstName} ${u.lastName}` : 'Anonymous'}</Text>
      {u && <Text style={{ color: C.muted, fontSize: 12 }}>{u.schoolRole}</Text>}
    </View>
  );
}

function PostCard({ p, mod, onChange }: { p: Post; mod: boolean; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState('');
  const { data: comments, reload } = useLoad(() => getComments(p.id), [p.id, open]);
  const send = () => addComment(p.id, reply).then(() => { setReply(''); reload(); }).catch((e) => Alert.alert('Not allowed', e.message));
  const act = (a: Parameters<typeof moderatePost>[1]) => moderatePost(p.id, a).then(onChange);

  return (
    <Card>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Author id={p.authorId} anon={(p as any).anonymous} />
        <View style={s.row}>
          {p.pinned && <Chip label="📌 Pinned" />}
          {p.status !== 'published' && <Chip label={p.status} color={p.status === 'pending' ? '#B45309' : C.danger} />}
        </View>
      </View>
      {p.title ? <Text style={{ fontWeight: '700', fontSize: 16, color: C.ink }}>{p.title}</Text> : null}
      {p.body ? <P>{p.body}</P> : null}
      {p.attachments.filter((a) => a.type === 'image').map((a) => <Image key={a.url} source={{ uri: a.url }} style={{ height: 160, borderRadius: 10 }} />)}
      {p.poll && p.poll.options.map((o) => <Card key={o.id} style={{ padding: 10 }}><P>{o.label} — {o.votes.length} vote(s)</P></Card>)}
      <View style={[s.row, { flexWrap: 'wrap' }]}>
        {p.score ? <Text style={{ color: C.muted }}>▲ {p.score}</Text> : null}
        {Object.entries(p.reactions).map(([e, ids]) => <Text key={e}>{e} {ids.length}</Text>)}
        <Text style={{ color: C.primary, fontWeight: '600' }} onPress={() => setOpen(!open)}>
          {open ? 'Hide' : 'Replies'}{comments ? ` (${comments.length})` : ''}
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
          <View style={s.row}>
            <TextInput value={reply} onChangeText={setReply} placeholder="Reply…" style={[s.input, { flex: 1, padding: 8 }]} />
            <Button label="Send" onPress={send} disabled={!reply.trim()} />
          </View>
        </View>
      )}
    </Card>
  );
}

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, reload } = useLoad(() => getGroup(id), [id]);
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [anon, setAnon] = useState(false);
  if (!data) return <Loading />;
  const { group, abilities, posts, myRole } = data;
  const mode = group.settings.mode;
  const isChat = mode === 'chat';
  const asQuestion = !abilities.post.allowed && abilities.askQuestion.allowed;
  const composer = asQuestion ? abilities.askQuestion : abilities.post;

  const submit = () =>
    createPost(id, { kind: asQuestion ? 'question' : isChat ? 'message' : mode === 'broadcast' ? 'announcement' : 'thread', body: text, title: isChat ? undefined : title, anonymous: anon })
      .then((p) => { setText(''); setTitle(''); reload(); if (p.status === 'pending') Alert.alert('Submitted', 'A moderator will review it before it appears.'); })
      .catch((e) => Alert.alert('Not allowed', e.message));

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{
        title: group.name,
        headerRight: () => abilities.editSettings
          ? <Pressable onPress={() => router.push(`/group/${id}/settings`)}><Text style={{ color: '#fff', fontWeight: '700' }}>Settings</Text></Pressable> : null,
      }} />
      <FlatList
        data={posts} keyExtractor={(p) => p.id} contentContainerStyle={s.pad}
        inverted={false}
        ListHeaderComponent={
          <View style={{ gap: 6 }}>
            <P muted>{group.description}</P>
            <View style={s.row}><Chip label={`You: ${myRole ?? 'viewer'}`} />{group.settings.locked && <Chip label="🔒 Locked" color={C.danger} />}</View>
          </View>}
        renderItem={({ item }) => <PostCard p={item} mod={abilities.moderate} onChange={reload} />}
      />
      <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: '#fff', gap: 8 }}>
        {composer.allowed ? (
          <>
            {!isChat && <TextInput value={title} onChangeText={setTitle} placeholder={asQuestion ? 'Question title' : 'Title'} style={s.input} />}
            <View style={s.row}>
              <TextInput value={text} onChangeText={setText} multiline placeholder={asQuestion ? 'Ask a question…' : isChat ? 'Message' : 'Write a post…'} style={[s.input, { flex: 1 }]} />
              <Button label={asQuestion ? 'Ask' : 'Post'} onPress={submit} disabled={!text.trim()} />
            </View>
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
