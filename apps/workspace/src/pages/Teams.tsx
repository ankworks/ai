/**
 * Teams (Phase 5): my teams, create, members, invites (link/email/@username),
 * custom roles, module toggles, activity log. Every mutation is authorized
 * server-side — this UI only reflects the permissions the API reports.
 */

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ClipboardCopy,
  KeyRound,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useI18n,
  type I18nKey,
} from '@conai/ui';
import { publicEnv } from '../env';
import { apiFetch, ApiError } from '../lib/api';

interface TeamSummary {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  modules: Record<string, boolean>;
  memberCount: number;
  role: string;
  createdAt: string;
}

interface TeamDetail {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  modules: Record<string, boolean>;
  memberCount: number;
  myRole: string;
  myPermissions: string[];
  createdAt: string;
  updatedAt: string;
}

interface MemberRow {
  userId: string;
  role: string;
  customRoleId: string | null;
  customRoleName: string | null;
  username: string;
  displayName: string;
  joinedAt: string;
}

interface InviteRow {
  id: string;
  token: string;
  mode: 'link' | 'email' | 'username';
  email: string | null;
  username: string | null;
  role: string;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

interface ActivityRow {
  id: string;
  type: string;
  meta: Record<string, unknown>;
  actorId: string;
  actorUsername: string;
  actorName: string;
  createdAt: string;
}

const MODULE_LABELS = {
  overview: 'ws.teams.modOverview',
  projects: 'ws.teams.modProjects',
  tasks: 'ws.teams.modTasks',
  channels: 'ws.teams.modChannels',
  documents: 'ws.teams.modDocuments',
  calendar: 'ws.teams.modCalendar',
  activity: 'ws.teams.modActivity',
  members: 'ws.teams.modMembers',
  automations: 'ws.teams.modAutomations',
  settings: 'ws.teams.modSettings',
} as const;

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable — the token is shown as text */
        }
      }}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <ClipboardCopy className="h-3.5 w-3.5" aria-hidden />
      )}
      {copied ? t('ws.teams.copied') : label}
    </Button>
  );
}

export function TeamsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);

  // Signed-out gate (honest: no data is fabricated).
  const me = useQuery({
    queryKey: ['me-teams'],
    queryFn: () => apiFetch<{ user: { id: string } }>('/v1/me'),
    retry: false,
  });
  const signedOut = me.error instanceof ApiError && me.error.status === 401;

  const teams = useQuery({
    queryKey: ['teams'],
    queryFn: () => apiFetch<{ teams: TeamSummary[] }>('/v1/teams'),
    enabled: !signedOut,
    refetchOnWindowFocus: false,
  });

  const detail = useQuery({
    queryKey: ['team', selectedId],
    queryFn: () => apiFetch<{ team: TeamDetail }>(`/v1/teams/${selectedId}`),
    enabled: !signedOut && selectedId !== null,
    refetchOnWindowFocus: false,
  });

  const members = useQuery({
    queryKey: ['team', selectedId, 'members'],
    queryFn: () => apiFetch<{ members: MemberRow[] }>(`/v1/teams/${selectedId}/members`),
    enabled: !signedOut && selectedId !== null,
    refetchOnWindowFocus: false,
  });

  const invites = useQuery({
    queryKey: ['team', selectedId, 'invites'],
    queryFn: () => apiFetch<{ invites: InviteRow[] }>(`/v1/teams/${selectedId}/invites`),
    enabled: !signedOut && selectedId !== null,
    refetchOnWindowFocus: false,
  });

  const activity = useQuery({
    queryKey: ['team', selectedId, 'activity'],
    queryFn: () => apiFetch<{ activity: ActivityRow[] }>(`/v1/teams/${selectedId}/activity`),
    enabled: !signedOut && selectedId !== null,
    refetchOnWindowFocus: false,
  });

  const invalidateTeam = () => {
    void queryClient.invalidateQueries({ queryKey: ['teams'] });
    void queryClient.invalidateQueries({ queryKey: ['team'] });
  };

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch<{ team: { id: string } }>('/v1/teams', {
        method: 'POST',
        json: { name },
      }),
    onSuccess: (data) => {
      setSelectedId(data.team.id);
      invalidateTeam();
    },
  });

  const inviteMutation = useMutation({
    mutationFn: (vars: {
      teamId: string;
      mode: 'link' | 'email' | 'username';
      email?: string;
      username?: string;
      role: string;
    }) =>
      apiFetch<{ invite: { token: string } }>(`/v1/teams/${vars.teamId}/invites`, {
        method: 'POST',
        json: {
          mode: vars.mode,
          email: vars.email,
          username: vars.username,
          role: vars.role,
        },
      }),
    onSuccess: () => invalidateTeam(),
  });

  const acceptMutation = useMutation({
    mutationFn: (vars: { teamId: string; token: string }) =>
      apiFetch<{ ok: true }>(`/v1/teams/${vars.teamId}/invites/${vars.token}/accept`, {
        method: 'POST',
        json: {},
      }),
    onSuccess: () => invalidateTeam(),
  });

  const revokeMutation = useMutation({
    mutationFn: (vars: { teamId: string; token: string }) =>
      apiFetch(`/v1/teams/${vars.teamId}/invites/${vars.token}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidateTeam(),
  });

  const removeMutation = useMutation({
    mutationFn: (vars: { teamId: string; userId: string }) =>
      apiFetch(`/v1/teams/${vars.teamId}/members/${vars.userId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => invalidateTeam(),
  });

  const roleMutation = useMutation({
    mutationFn: (vars: { teamId: string; userId: string; role: string }) =>
      apiFetch(`/v1/teams/${vars.teamId}/members/${vars.userId}`, {
        method: 'PATCH',
        json: { role: vars.role },
      }),
    onSuccess: () => invalidateTeam(),
  });

  const modulesMutation = useMutation({
    mutationFn: (modules: Record<string, boolean>) =>
      apiFetch(`/v1/teams/${selectedId}/modules`, {
        method: 'PUT',
        json: { modules },
      }),
    onSuccess: () => invalidateTeam(),
  });

  const transferMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/v1/teams/${selectedId}/transfer`, {
        method: 'POST',
        json: { userId },
      }),
    onSuccess: () => invalidateTeam(),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiFetch(`/v1/teams/${selectedId}`, { method: 'DELETE' }),
    onSuccess: () => {
      setSelectedId(null);
      invalidateTeam();
    },
  });

  const can = (perm: string) => detail.data?.team.myPermissions.includes(perm) ?? false;

  const inviteUrl = (token: string) =>
    `${window.location.origin}${window.location.pathname}#/teams/invite?team=${selectedId}&token=${token}`;

  if (signedOut) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
            {t('ws.teams')}
          </h1>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>{t('ws.teamsSignInTitle')}</CardTitle>
            <CardDescription>{t('ws.teamsSignInBody')}</CardDescription>
          </CardHeader>
          <CardContent>
            <a href={`${publicEnv.VITE_ACCOUNT_URL}/sign-in`}>
              <Button>{t('ws.chatSignInCta')}</Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-foreground text-2xl font-bold tracking-tight">
            {t('ws.teams')}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">{t('ws.teamsSubtitle')}</p>
        </div>
        <CreateTeamDialog
          creating={createMutation.isPending}
          error={createMutation.error instanceof ApiError ? createMutation.error.message : null}
          onSubmit={(name) => createMutation.mutate(name)}
        />
      </div>

      {teams.isPending ? (
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : (teams.data?.teams.length ?? 0) === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('ws.teamsEmptyTitle')}</CardTitle>
            <CardDescription>{t('ws.teamsEmptyBody')}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(teams.data?.teams ?? []).map((tm) => (
            <Card key={tm.id} className={tm.id === selectedId ? 'border-primary' : undefined}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-lg">{tm.name}</CardTitle>
                  <Badge variant={tm.role === 'owner' ? 'success' : 'outline'}>
                    {t(`ws.teams.role.${tm.role}` as I18nKey)}
                  </Badge>
                </div>
                <CardDescription>
                  {t('ws.teams.memberCount', { count: tm.memberCount })}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button
                  variant={tm.id === selectedId ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedId(tm.id)}
                >
                  {t('ws.teams.open')}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedId && detail.data ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">{detail.data.team.name}</CardTitle>
                <CardDescription>
                  {t('ws.teams.memberCount', {
                    count: detail.data.team.memberCount,
                  })}{' '}
                  · {t(`ws.teams.role.${detail.data.team.myRole}` as I18nKey)}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <RenameTeamDialog teamId={selectedId} onRenamed={invalidateTeam} />
                {can('team.transfer_ownership') && (
                  <TransferDialog
                    members={members.data?.members ?? []}
                    onTransfer={(userId) => transferMutation.mutate(userId)}
                  />
                )}
                {can('team.delete') && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (window.confirm(t('ws.teams.deleteConfirm'))) deleteMutation.mutate();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {t('ws.teams.delete')}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="members">
              <TabsList>
                <TabsTrigger value="members">{t('ws.teams.tabMembers')}</TabsTrigger>
                <TabsTrigger value="invites">{t('ws.teams.tabInvites')}</TabsTrigger>
                <TabsTrigger value="modules">{t('ws.teams.tabModules')}</TabsTrigger>
                <TabsTrigger value="activity">{t('ws.teams.tabActivity')}</TabsTrigger>
              </TabsList>

              <TabsContent value="members" className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {can('team.members.invite') && (
                    <InviteDialog
                      inviting={inviteMutation.isPending}
                      onInvite={(vars) => inviteMutation.mutate({ teamId: selectedId, ...vars })}
                    />
                  )}
                  <JoinDialog
                    open={joinOpen}
                    onOpenChange={setJoinOpen}
                    accepting={acceptMutation.isPending}
                    error={
                      acceptMutation.error instanceof ApiError ? acceptMutation.error.message : null
                    }
                    onAccept={(vars) => acceptMutation.mutate(vars)}
                  />
                </div>
                {inviteMutation.data && (
                  <div className="bg-muted flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm">
                    <KeyRound className="text-muted-foreground h-4 w-4" aria-hidden />
                    <code className="text-foreground text-xs break-all">
                      {inviteUrl(inviteMutation.data.invite.token)}
                    </code>
                    <CopyButton
                      text={inviteUrl(inviteMutation.data.invite.token)}
                      label={t('ws.teams.copyLink')}
                    />
                  </div>
                )}
                {members.isPending ? (
                  <Skeleton className="h-24" />
                ) : (
                  <ul className="divide-border divide-y">
                    {(members.data?.members ?? []).map((m) => (
                      <li
                        key={m.userId}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                      >
                        <div>
                          <p className="text-foreground text-sm font-medium">
                            {m.displayName}{' '}
                            <span className="text-muted-foreground">@{m.username}</span>
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {m.customRoleName ?? t(`ws.teams.role.${m.role}` as I18nKey)}
                            {' · '}
                            {t('ws.teams.joined', { when: formatDateTime(m.joinedAt) })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {m.role !== 'owner' && m.userId !== me.data?.user.id && (
                            <>
                              {can('team.roles.manage') && (
                                <Select
                                  value={m.role}
                                  onValueChange={(role) =>
                                    roleMutation.mutate({
                                      teamId: selectedId,
                                      userId: m.userId,
                                      role,
                                    })
                                  }
                                >
                                  <SelectTrigger className="w-28" aria-label={t('ws.teams.role')}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(['admin', 'member', 'viewer'] as const).map((r) => (
                                      <SelectItem key={r} value={r}>
                                        {t(`ws.teams.role.${r}` as I18nKey)}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                              {can('team.members.remove') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    removeMutation.mutate({
                                      teamId: selectedId,
                                      userId: m.userId,
                                    })
                                  }
                                >
                                  <UserMinus className="h-3.5 w-3.5" aria-hidden />
                                  {t('ws.teams.remove')}
                                </Button>
                              )}
                            </>
                          )}
                          {m.userId === me.data?.user.id && m.role !== 'owner' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                window.confirm(t('ws.teams.leaveConfirm')) &&
                                removeMutation.mutate({
                                  teamId: selectedId,
                                  userId: m.userId,
                                })
                              }
                            >
                              {t('ws.teams.leave')}
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="invites" className="space-y-4">
                {invites.isPending ? (
                  <Skeleton className="h-24" />
                ) : (invites.data?.invites.length ?? 0) === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('ws.teams.noInvites')}</p>
                ) : (
                  <ul className="divide-border divide-y">
                    {(invites.data?.invites ?? []).map((inv) => (
                      <li
                        key={inv.id}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                      >
                        <div>
                          <p className="text-foreground text-sm font-medium">
                            {inv.mode === 'email'
                              ? inv.email
                              : inv.mode === 'username'
                                ? `@${inv.username}`
                                : t('ws.teams.linkInvite')}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {t(`ws.teams.role.${inv.role}` as I18nKey)}
                            {' · '}
                            {t('ws.teams.expires', { when: formatDateTime(inv.expiresAt) })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {inv.mode === 'link' && (
                            <CopyButton
                              text={inviteUrl(inv.token)}
                              label={t('ws.teams.copyLink')}
                            />
                          )}
                          {can('team.members.invite') && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                revokeMutation.mutate({ teamId: selectedId, token: inv.token })
                              }
                            >
                              {t('ws.teams.revoke')}
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>

              <TabsContent value="modules" className="space-y-4">
                {can('team.modules.manage') ? (
                  <ul className="divide-border divide-y">
                    {Object.entries(MODULE_LABELS).map(([mod, labelKey]) => (
                      <li key={mod} className="flex items-center justify-between py-2.5">
                        <span className="text-foreground text-sm">{t(labelKey)}</span>
                        <Switch
                          checked={detail.data.team.modules[mod] ?? true}
                          onCheckedChange={(checked) =>
                            modulesMutation.mutate({
                              ...detail.data.team.modules,
                              [mod]: checked,
                            })
                          }
                          aria-label={t(labelKey)}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">{t('ws.teams.modulesOwnerOnly')}</p>
                )}
              </TabsContent>

              <TabsContent value="activity">
                {activity.isPending ? (
                  <Skeleton className="h-32" />
                ) : (activity.data?.activity.length ?? 0) === 0 ? (
                  <p className="text-muted-foreground text-sm">{t('ws.teams.activityEmpty')}</p>
                ) : (
                  <ul className="divide-border divide-y">
                    {(activity.data?.activity ?? []).map((a) => (
                      <li key={a.id} className="py-2.5">
                        <p className="text-foreground text-sm">
                          <span className="font-medium">@{a.actorUsername}</span> {a.type}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {formatDateTime(a.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            {t('ws.teams.selectHint')}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CreateTeamDialog({
  creating,
  error,
  onSubmit,
}: {
  creating: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" aria-hidden />
          {t('ws.teams.create')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ws.teams.createTitle')}</DialogTitle>
          <DialogDescription>{t('ws.teams.createBody')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSubmit(name.trim());
            setName('');
            setOpen(false);
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="team-name">{t('ws.teams.name')}</Label>
            <Input
              id="team-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={creating || !name.trim()}>
              {t('ws.teams.createCta')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameTeamDialog({ teamId, onRenamed }: { teamId: string; onRenamed: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const mutation = useMutation({
    mutationFn: (name: string) =>
      apiFetch(`/v1/teams/${teamId}`, { method: 'PATCH', json: { name } }),
    onSuccess: () => {
      setOpen(false);
      setName('');
      onRenamed();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="h-3.5 w-3.5" aria-hidden />
          {t('ws.teams.rename')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ws.teams.renameTitle')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!name.trim()) return;
            mutation.mutate(name.trim());
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="team-rename">{t('ws.teams.name')}</Label>
            <Input
              id="team-rename"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>
          {mutation.error instanceof ApiError ? (
            <p className="text-destructive text-sm">{mutation.error.message}</p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || !name.trim()}>
              {t('ws.librarySaveChanges')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TransferDialog({
  members,
  onTransfer,
}: {
  members: MemberRow[];
  onTransfer: (userId: string) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const candidates = members.filter((m) => m.role !== 'owner');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          {t('ws.teams.transfer')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ws.teams.transferTitle')}</DialogTitle>
          <DialogDescription>{t('ws.teams.transferBody')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger aria-label={t('ws.teams.transferTarget')}>
              <SelectValue placeholder={t('ws.teams.transferTarget')} />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((m) => (
                <SelectItem key={m.userId} value={m.userId}>
                  {m.displayName} (@{m.username})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        <DialogFooter>
          <Button
            onClick={() => {
              if (!userId) return;
              try {
                onTransfer(userId);
                setOpen(false);
                setUserId('');
                setError(null);
              } catch (err) {
                setError(err instanceof ApiError ? err.message : t('ws.chatErrGeneric'));
              }
            }}
            disabled={!userId}
          >
            {t('ws.teams.transferCta')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({
  inviting,
  onInvite,
}: {
  inviting: boolean;
  onInvite: (vars: {
    mode: 'link' | 'email' | 'username';
    email?: string;
    username?: string;
    role: string;
  }) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'link' | 'email' | 'username'>('link');
  const [target, setTarget] = useState('');
  const [role, setRole] = useState('member');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const vars: {
      mode: 'link' | 'email' | 'username';
      email?: string;
      username?: string;
      role: string;
    } = {
      mode,
      role,
    };
    if (mode === 'email') vars.email = target.trim();
    if (mode === 'username') vars.username = target.trim().replace(/^@/, '');
    if ((mode === 'email' || mode === 'username') && !target.trim()) {
      setError(t('ws.teams.inviteTargetRequired'));
      return;
    }
    onInvite(vars);
    setOpen(false);
    setTarget('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="h-4 w-4" aria-hidden />
          {t('ws.teams.invite')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ws.teams.inviteTitle')}</DialogTitle>
          <DialogDescription>{t('ws.teams.inviteBody')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('ws.teams.inviteMode')}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
              <SelectTrigger aria-label={t('ws.teams.inviteMode')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="link">{t('ws.teams.modeLink')}</SelectItem>
                <SelectItem value="email">{t('ws.teams.modeEmail')}</SelectItem>
                <SelectItem value="username">{t('ws.teams.modeUsername')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode !== 'link' && (
            <div className="space-y-2">
              <Label htmlFor="invite-target">
                {mode === 'email' ? 'Email' : t('ws.teams.username')}
              </Label>
              <Input
                id="invite-target"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={mode === 'email' ? 'a@friend.test' : '@handle'}
              />
            </div>
          )}
          <div className="space-y-2">
            <Label>{t('ws.teams.role')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger aria-label={t('ws.teams.role')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(['admin', 'member', 'viewer'] as const).map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`ws.teams.role.${r}` as I18nKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={inviting}>
            {t('ws.teams.inviteCta')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JoinDialog({
  open,
  onOpenChange,
  accepting,
  error,
  onAccept,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accepting: boolean;
  error: string | null;
  onAccept: (vars: { teamId: string; token: string }) => void;
}) {
  const { t } = useI18n();
  const [teamId, setTeamId] = useState('');
  const [token, setToken] = useState('');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRound className="h-3.5 w-3.5" aria-hidden />
          {t('ws.teams.join')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('ws.teams.joinTitle')}</DialogTitle>
          <DialogDescription>{t('ws.teams.joinBody')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (!teamId.trim() || !token.trim()) return;
            onAccept({ teamId: teamId.trim(), token: token.trim() });
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="join-team">ID</Label>
            <Input
              id="join-team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-token">{t('ws.teams.inviteToken')}</Label>
            <Input
              id="join-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              required
            />
          </div>
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={accepting || !teamId.trim() || !token.trim()}>
              {t('ws.teams.joinCta')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
