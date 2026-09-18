import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { z } from 'zod';
import { authApi } from '@/services/api';
import { useSession } from '@/hooks/useSession';
import { formatDateTime, initials } from '@/lib/format';
import { ApiRequestError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';
import type { ManagedUser, Role } from '@/types';

/**
 * Gestão de usuários da plataforma (exclusivo do SUPER_ADMIN).
 *
 * Permite criar administradores de evento e recepcionistas. O acesso a esta
 * tela é restrito por rota e revalidado pelo servidor.
 */

const createUserSchema = z.object({
  name: z.string().trim().min(3, 'Informe o nome completo').max(120),
  email: z.string().trim().email('E-mail inválido'),
  password: z
    .string()
    .min(8, 'A senha deve ter ao menos 8 caracteres')
    .refine((value) => /[A-Za-z]/.test(value), 'Inclua ao menos uma letra')
    .refine((value) => /\d/.test(value), 'Inclua ao menos um número'),
  role: z.enum(['ADMIN', 'RECEPTIONIST']),
});

type CreateUserForm = z.infer<typeof createUserSchema>;

export function UsersPage() {
  const toast = useToast();
  const { user: currentUser } = useSession();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: users, isLoading, error, refetch } = useQuery<ManagedUser[]>({
    queryKey: ['auth', 'users'],
    queryFn: () => authApi.listUsers(),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateUserForm>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '', role: 'ADMIN' },
  });

  const create = useMutation({
    mutationFn: (input: CreateUserForm) => authApi.createUser(input),
    onSuccess: (user) => {
      toast.success('Usuário criado!', `${user.name} já pode acessar com o perfil ${ROLE_LABELS[user.role]}.`);
      void queryClient.invalidateQueries({ queryKey: ['auth', 'users'] });
      reset();
      setCreateOpen(false);
    },
    onError: (error) => {
      toast.error(
        'Não foi possível criar o usuário',
        error instanceof ApiRequestError ? error.message : 'Tente novamente.',
      );
    },
  });

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-wedding-900">Usuários</h1>
          <p className="mt-1 text-sm text-wedding-500">
            Gerencie quem tem acesso à plataforma e com qual perfil.
          </p>
        </div>

        <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
          Novo usuário
        </Button>
      </header>

      {/* Explicação dos perfis */}
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <RoleCard
          icon={ShieldCheck}
          title="Super Admin"
          description="Gerencia a plataforma, cria usuários e vê todos os eventos."
        />
        <RoleCard
          icon={Users}
          title="Administrador"
          description="Gerencia os eventos dos quais é responsável: convidados, convites e local."
        />
        <RoleCard
          icon={KeyRound}
          title="Recepção"
          description="Acesso apenas ao controle de entrada. Não edita nem exclui dados."
        />
      </div>

      {isLoading && <LoadingState />}

      {error && <ErrorState title="Não foi possível carregar os usuários" onRetry={() => void refetch()} />}

      {!isLoading && !error && (users?.length ?? 0) === 0 && (
        <div className="card">
          <EmptyState icon={Users} title="Nenhum usuário cadastrado" />
        </div>
      )}

      {!isLoading && !error && (users?.length ?? 0) > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Último acesso</th>
                <th className="text-center">Eventos</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-wedding-900 text-xs font-semibold text-white">
                        {initials(user.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-wedding-900">
                          {user.name}
                          {user.id === currentUser?.id && (
                            <span className="ml-2 text-xs text-wedding-400">(você)</span>
                          )}
                        </p>
                        <p className="truncate text-xs text-wedding-400">{user.email}</p>
                      </div>
                    </div>
                  </td>

                  <td>
                    <span
                      className={
                        user.role === 'SUPER_ADMIN'
                          ? 'badge-info'
                          : user.role === 'ADMIN'
                            ? 'badge-success'
                            : 'badge-neutral'
                      }
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>

                  <td>
                    <span className={user.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}>
                      {user.status === 'ACTIVE' ? 'Ativo' : 'Suspenso'}
                    </span>
                  </td>

                  <td className="text-xs text-wedding-500">
                    {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : 'Nunca acessou'}
                  </td>

                  <td className="text-center tabular-nums text-wedding-600">
                    {user.role === 'ADMIN'
                      ? (user._count?.events ?? 0)
                      : (user._count?.memberships ?? 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de criação */}
      <Modal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          reset();
        }}
        title="Novo usuário"
        description="A senha deve ter ao menos 8 caracteres, com letras e números."
        size="md"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                reset();
              }}
              disabled={create.isPending}
            >
              Cancelar
            </Button>
            <Button
              icon={<UserPlus className="h-4 w-4" />}
              onClick={handleSubmit((values) => create.mutate(values))}
              loading={create.isPending}
            >
              Criar usuário
            </Button>
          </>
        }
      >
        <form
          onSubmit={handleSubmit((values) => create.mutate(values))}
          className="space-y-4"
          noValidate
        >
          <Input
            label="Nome completo"
            placeholder="Ex.: Maria Oliveira"
            error={errors.name?.message}
            required
            autoFocus
            {...register('name')}
          />

          <Input
            label="E-mail"
            type="email"
            placeholder="usuario@email.com"
            autoComplete="off"
            error={errors.email?.message}
            required
            {...register('email')}
          />

          <Input
            label="Senha inicial"
            type="password"
            placeholder="Mínimo de 8 caracteres"
            autoComplete="new-password"
            hint="O usuário deve trocar a senha no primeiro acesso"
            error={errors.password?.message}
            required
            {...register('password')}
          />

          <Select label="Perfil de acesso" error={errors.role?.message} {...register('role')}>
            <option value="ADMIN">Administrador do evento</option>
            <option value="RECEPTIONIST">Recepção / Controle de entrada</option>
          </Select>
        </form>
      </Modal>
    </div>
  );
}

function RoleCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
}) {
  return (
    <div className="card p-4">
      <div className="w-fit rounded-xl bg-wedding-100 p-2 text-wedding-600">
        <Icon className="h-4 w-4" />
      </div>
      <p className="mt-3 text-sm font-semibold text-wedding-900">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-wedding-500">{description}</p>
    </div>
  );
}

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Administrador',
  RECEPTIONIST: 'Recepção',
};
