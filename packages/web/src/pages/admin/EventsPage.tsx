import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CalendarHeart, CalendarPlus, Plus, Search, Users } from 'lucide-react';
import { useCreateEvent, useEvents } from '@/hooks/useApi';
import { eventFormSchema, type EventForm } from '@/lib/validators';
import { formatShortDate, toDateInputValue } from '@/lib/format';
import { ApiRequestError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, ErrorState, EventStatusBadge, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

/**
 * Lista e criação de eventos.
 *
 * O formulário de criação já pede as informações essenciais do convite
 * (noivos, data, mensagens), pois é isso que aparece para o convidado.
 */
export function EventsPage() {
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const { data: events, isLoading, error, refetch } = useEvents();

  const filtered = (events ?? []).filter((event) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      event.title.toLowerCase().includes(term) ||
      (event.hostsName ?? '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-display font-semibold tracking-tight text-wedding-900">Eventos</h1>
          <p className="mt-1 text-sm text-wedding-500">
            Crie e gerencie os eventos, convidados e convites.
          </p>
        </div>

        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
          Novo evento
        </Button>
      </header>

      {/* Busca */}
      <div className="relative mb-5 max-w-md">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-wedding-400"
          aria-hidden
        />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar por nome do evento ou anfitriões..."
          className="input pl-10"
        />
      </div>

      {isLoading && <LoadingState />}

      {error && (
        <ErrorState
          title="Não foi possível carregar os eventos"
          onRetry={() => void refetch()}
        />
      )}

      {!isLoading && !error && filtered.length === 0 && (
        <div className="card">
          <EmptyState
            icon={CalendarHeart}
            title={search ? 'Nenhum evento encontrado' : 'Nenhum evento cadastrado'}
            description={
              search
                ? 'Tente outro termo de busca.'
                : 'Crie seu primeiro evento para começar a cadastrar convidados.'
            }
            action={
              !search ? (
                <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
                  Criar evento
                </Button>
              ) : undefined
            }
          />
        </div>
      )}

      {!isLoading && !error && filtered.length > 0 && (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Evento</th>
                <th>Data</th>
                <th>Local</th>
                <th className="text-center">Convidados</th>
                <th className="text-center">Confirmados</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((event) => (
                <tr key={event.id}>
                  <td>
                    <p className="font-medium text-wedding-900">{event.hostsName ?? event.title}</p>
                    <p className="text-xs text-wedding-400">{event.title}</p>
                  </td>
                  <td className="whitespace-nowrap">
                    {formatShortDate(event.eventDate)}
                    <span className="block text-xs text-wedding-400">{event.startTime}</span>
                  </td>
                  <td className="max-w-[220px] truncate">
                    {event.venue ? `${event.venue.name}, ${event.venue.city}` : '—'}
                  </td>
                  <td className="text-center tabular-nums">
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-wedding-400" />
                      {event._count?.guests ?? 0}
                    </span>
                  </td>
                  <td className="text-center tabular-nums">
                    <span className="font-medium text-success-600">
                      {event.invitationCounts?.confirmed ?? 0}
                    </span>
                    <span className="text-wedding-400">
                      {' / '}
                      {event.invitationCounts?.total ?? 0}
                    </span>
                  </td>
                  <td>
                    <EventStatusBadge status={event.status} />
                  </td>
                  <td>
                    <div className="flex justify-end gap-1.5">
                      <Link
                        to={`/eventos/${event.id}/convidados`}
                        className="btn-ghost !px-2.5 !py-1.5 !text-xs"
                      >
                        Convidados
                      </Link>
                      <Link
                        to={`/eventos/${event.id}`}
                        className="btn-secondary !px-2.5 !py-1.5 !text-xs"
                      >
                        Abrir
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CreateEventModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal de criação
// ---------------------------------------------------------------------------

function CreateEventModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const create = useCreateEvent();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EventForm>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      title: '',
      hostsName: '',
      coupleNameA: '',
      coupleNameB: '',
      eventDate: '',
      startTime: '19:00',
      endTime: '',
      rsvpDeadline: '',
      coverImageUrl: '',
      welcomeMessage: '',
      inviteMessage: '',
      dressCode: '',
      status: 'DRAFT',
      allowCompanions: true,
      allowShareInvite: false,
    },
  });

  const onSubmit = (values: EventForm) => {
    setServerError(null);

    create.mutate(
      {
        ...values,
        coverImageUrl: values.coverImageUrl || undefined,
        rsvpDeadline: values.rsvpDeadline || undefined,
        endTime: values.endTime || undefined,
      },
      {
        onSuccess: () => {
          toast.success('Evento criado!', 'Agora cadastre o local e os convidados.');
          reset();
          onClose();
        },
        onError: (error) => {
          setServerError(
            error instanceof ApiRequestError ? error.message : 'Não foi possível criar o evento.',
          );
        },
      },
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Novo evento"
      description="Preencha as informações principais. Você poderá ajustar tudo depois."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            loading={isSubmitting || create.isPending}
            icon={<CalendarPlus className="h-4 w-4" />}
          >
            Criar evento
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {/* Identificação */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Identificação
          </legend>

          <Input
            label="Título do evento"
            placeholder="Ex.: Casamento de João & Maria"
            error={errors.title?.message}
            required
            {...register('title')}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Nome dos anfitriões"
              placeholder="João & Maria"
              hint="Como aparece no convite"
              error={errors.hostsName?.message}
              {...register('hostsName')}
            />
            <Input label="Noivo(a) 1" placeholder="João" {...register('coupleNameA')} />
            <Input label="Noivo(a) 2" placeholder="Maria" {...register('coupleNameB')} />
          </div>
        </fieldset>

        {/* Data e hora */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Data e horário
          </legend>

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Data do evento"
              type="date"
              min={toDateInputValue(new Date())}
              error={errors.eventDate?.message}
              required
              {...register('eventDate')}
            />
            <Input
              label="Início"
              type="time"
              error={errors.startTime?.message}
              required
              {...register('startTime')}
            />
            <Input label="Término" type="time" error={errors.endTime?.message} {...register('endTime')} />
          </div>

          <Input
            label="Prazo para confirmação (RSVP)"
            type="date"
            hint="Após esta data, o convidado não consegue mais confirmar"
            {...register('rsvpDeadline')}
          />
        </fieldset>

        {/* Convite */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Convite
          </legend>

          <Input
            label="URL da foto de capa"
            type="url"
            placeholder="https://..."
            hint="Aparece no topo do convite"
            error={errors.coverImageUrl?.message}
            {...register('coverImageUrl')}
          />

          <Textarea
            label="Mensagem de boas-vindas"
            placeholder="Estamos muito felizes em compartilhar esse momento especial com você."
            rows={2}
            {...register('welcomeMessage')}
          />

          <Textarea
            label="Mensagem do convite"
            placeholder="Será uma honra ter você ao nosso lado neste dia tão importante."
            rows={2}
            {...register('inviteMessage')}
          />

          <Input
            label="Dress code"
            placeholder="Ex.: Traje esporte fino"
            {...register('dressCode')}
          />
        </fieldset>

        {/* Configurações */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Configurações
          </legend>

          <Select label="Status inicial" {...register('status')}>
            <option value="DRAFT">Rascunho (não publicar ainda)</option>
            <option value="PUBLISHED">Publicado</option>
          </Select>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-wedding-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-wedding-300 text-wedding-900"
              {...register('allowCompanions')}
            />
            <span>Permitir que o convidado informe acompanhantes (até o limite autorizado)</span>
          </label>

          {serverError && (
            <div role="alert" className="rounded-xl border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700">
              {serverError}
            </div>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
