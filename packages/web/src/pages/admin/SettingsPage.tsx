import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, ExternalLink, Info, Save } from 'lucide-react';
import { useEvent, useUpdateEvent } from '@/hooks/useApi';
import { eventFormSchema, type EventForm } from '@/lib/validators';
import { toDateInputValue } from '@/lib/format';
import { ApiRequestError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Input, Select, Textarea } from '@/components/ui/Field';
import { ErrorState, LoadingState } from '@/components/ui/States';
import { useToast } from '@/components/ui/Toast';

/**
 * Configurações do evento.
 *
 * Aqui o administrador ajusta tudo que compõe o convite: identificação dos
 * anfitriões, data, mensagens, dress code, lista de presentes e regras de
 * confirmação. Também encontra o link público do convite.
 */
export function SettingsPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data: event, isLoading, error, refetch } = useEvent(id);
  const update = useUpdateEvent(id ?? '');

  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<EventForm>({
    resolver: zodResolver(eventFormSchema),
    values: event
      ? {
        title: event.title,
        hostsName: event.hostsName ?? '',
        coupleNameA: event.coupleNameA ?? '',
        coupleNameB: event.coupleNameB ?? '',
        eventDate: toDateInputValue(event.eventDate),
        startTime: event.startTime,
        endTime: event.endTime ?? '',
        rsvpDeadline: toDateInputValue(event.rsvpDeadline),
        coverImageUrl: event.coverImageUrl ?? '',
        welcomeMessage: event.welcomeMessage ?? '',
        inviteMessage: event.inviteMessage ?? '',
        couplesMessage: event.couplesMessage ?? '',
        dressCode: event.dressCode ?? '',
        giftListUrl: event.giftListUrl ?? '',
        giftListNotes: event.giftListNotes ?? '',
        ceremonyInfo: event.ceremonyInfo ?? '',
        receptionInfo: event.receptionInfo ?? '',
        allowCompanions: event.allowCompanions,
        allowShareInvite: event.allowShareInvite,
        status: event.status,
      }
      : undefined,
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
      couplesMessage: '',
      dressCode: '',
      giftListUrl: '',
      giftListNotes: '',
      ceremonyInfo: '',
      receptionInfo: '',
      allowCompanions: true,
      allowShareInvite: false,
      status: 'DRAFT',
    },
  });

  const [savedAt, setSavedAt] = useState<string | null>(null);

  if (isLoading) return <LoadingState label="Carregando configurações..." />;

  if (error || !event) {
    return <ErrorState title="Evento não encontrado" onRetry={() => void refetch()} />;
  }

  const onSubmit = (values: EventForm) => {
    update.mutate(
      {
        ...values,
        coverImageUrl: values.coverImageUrl || undefined,
        giftListUrl: values.giftListUrl || undefined,
        rsvpDeadline: values.rsvpDeadline || undefined,
        endTime: values.endTime || undefined,
      },
      {
        onSuccess: () => {
          setSavedAt(new Date().toISOString());
          toast.success('Configurações salvas!', 'O convite dos convidados foi atualizado.');
          void refetch();
        },
        onError: (error) =>
          toast.error(
            'Não foi possível salvar',
            error instanceof ApiRequestError ? error.message : 'Tente novamente.',
          ),
      },
    );
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <Link
          to={`/eventos/${id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-wedding-500 transition-colors hover:text-wedding-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {event.hostsName ?? event.title}
        </Link>

        <h1 className="text-3xl font-display font-semibold tracking-tight text-wedding-900">Configurações</h1>
        <p className="mt-1 text-sm text-wedding-500">
          Tudo que aparece no convite do convidado é definido aqui.
        </p>
      </header>

      {/* Link público do convite */}
      <div className="card mb-6 p-5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-wedding-400">
          <Info className="h-3.5 w-3.5" />
          Convite do evento
        </p>
        <p className="mt-2 text-sm text-wedding-600">
          Cada convidado recebe um link exclusivo, gerado automaticamente. Os links individuais
          ficam na aba <Link to={`/eventos/${id}/convites`} className="font-medium text-wedding-900 underline">Convites</Link>.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="card space-y-6 p-6" noValidate>
        {/* Identificação */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Identificação
          </legend>

          <Input
            label="Título do evento"
            error={errors.title?.message}
            required
            {...register('title')}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <Input
              label="Nome dos anfitriões"
              hint="Aparece em destaque no convite"
              error={errors.hostsName?.message}
              {...register('hostsName')}
            />
            <Input label="Noivo(a) 1" {...register('coupleNameA')} />
            <Input label="Noivo(a) 2" {...register('coupleNameB')} />
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
            <Input label="Término" type="time" {...register('endTime')} />
          </div>

          <Input
            label="Prazo para confirmação (RSVP)"
            type="date"
            hint="Depois desta data o convidado não consegue mais confirmar"
            {...register('rsvpDeadline')}
          />
        </fieldset>

        {/* Visual do convite */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Visual do convite
          </legend>

          <Input
            label="URL da foto de capa"
            type="url"
            placeholder="https://..."
            hint="Imagem exibida no topo do convite e nas mensagens"
            error={errors.coverImageUrl?.message}
            {...register('coverImageUrl')}
          />

          {event.coverImageUrl && (
            <div className="overflow-hidden rounded-xl border-wedding-100">
              <img
                src={event.coverImageUrl}
                alt="Prévia da capa"
                className="h-40 w-full object-cover"
              />
            </div>
          )}
        </fieldset>

        {/* Mensagens */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Mensagens
          </legend>

          <Textarea
            label="Mensagem de boas-vindas"
            hint="Aparece logo abaixo do nome dos noivos"
            rows={2}
            {...register('welcomeMessage')}
          />

          <Textarea
            label="Mensagem do convite"
            hint="Usada no e-mail e no WhatsApp enviados aos convidados"
            rows={2}
            {...register('inviteMessage')}
          />

          <Textarea
            label="Mensagem dos noivos"
            hint="Texto pessoal exibido na seção 'Nossa mensagem' do convite"
            rows={4}
            {...register('couplesMessage')}
          />
        </fieldset>

        {/* Informações do evento */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Informações para os convidados
          </legend>

          <Input
            label="Dress code"
            placeholder="Ex.: Traje esporte fino"
            {...register('dressCode')}
          />

          <Textarea
            label="Informações da cerimônia"
            rows={2}
            {...register('ceremonyInfo')}
          />

          <Textarea
            label="Informações da recepção"
            rows={2}
            {...register('receptionInfo')}
          />
        </fieldset>

        {/* Lista de presentes */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Lista de presentes
          </legend>

          <Input
            label="URL da lista de presentes"
            type="url"
            placeholder="https://..."
            error={errors.giftListUrl?.message}
            {...register('giftListUrl')}
          />

          <Textarea
            label="Observação sobre presentes"
            rows={2}
            {...register('giftListNotes')}
          />
        </fieldset>

        {/* Regras */}
        <fieldset className="space-y-4 border-t border-wedding-100 pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wider text-wedding-400">
            Regras e status
          </legend>

          <Select label="Status do evento" {...register('status')}>
            <option value="DRAFT">Rascunho</option>
            <option value="PUBLISHED">Publicado</option>
            <option value="FINISHED">Encerrado</option>
            <option value="CANCELLED">Cancelado</option>
          </Select>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-wedding-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-wedding-300 text-wedding-900"
              {...register('allowCompanions')}
            />
            <span>Permitir que o convidado informe acompanhantes (respeitando o limite autorizado)</span>
          </label>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-wedding-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded border-wedding-300 text-wedding-900"
              {...register('allowShareInvite')}
            />
            <span>Permitir que o convidado compartilhe o próprio convite</span>
          </label>
        </fieldset>

        <div className="flex-wrap items-center justify-end gap-3 border-t border-wedding-100 pt-5">
          {savedAt && !isDirty && (
            <p className="mr-auto text-xs text-success-600">Salvo às {new Date(savedAt).toLocaleTimeString('pt-BR')}</p>
          )}
          <Link to={`/eventos/${id}`} className="btn-secondary">
            Cancelar
          </Link>
          <Button
            type="submit"
            icon={<Save className="h-4 w-4" />}
            loading={update.isPending}
            disabled={!isDirty}
          >
            Salvar alterações
          </Button>
        </div>
      </form>

      <p className="mt-4 flex items-center gap-2 text-xs text-wedding-400">
        <ExternalLink className="h-3.5 w-3.5" />
        As alterações passam a valer imediatamente para todos os convidados que abrirem o convite.
      </p>
    </div>
  );
}
