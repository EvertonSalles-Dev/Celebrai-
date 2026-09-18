import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { UserPlus, Save } from 'lucide-react';
import { useCreateGuest, useUpdateGuest } from '@/hooks/useApi';
import { guestFormSchema, type GuestForm } from '@/lib/validators';
import { formatPhoneInput } from '@/lib/validators';
import { ApiRequestError } from '@/lib/api-client';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import type { Guest } from '@/types';

/**
 * Formulário de convidado (criação e edição).
 *
 * Ao criar, o sistema gera automaticamente o convite individual com token único
 * e devolve o link — que é exibido para o administrador copiar ou enviar.
 */
export function GuestFormModal({
  open,
  onClose,
  eventId,
  guest,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  /** Quando informado, o formulário entra em modo de edição. */
  guest: Guest | null;
}) {
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const isEditing = Boolean(guest);
  const create = useCreateGuest(eventId);
  const update = useUpdateGuest(eventId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<GuestForm>({
    resolver: zodResolver(guestFormSchema),
    defaultValues: {
      fullName: '',
      email: '',
      whatsapp: '',
      allowedCompanions: 1,
      partyName: '',
      notes: '',
    },
  });

  // Preenche o formulário ao abrir em modo de edição.
  useEffect(() => {
    if (!open) return;

    setServerError(null);
    setCreatedLink(null);

    if (guest) {
      reset({
        fullName: guest.fullName,
        email: guest.email ?? '',
        whatsapp: guest.whatsapp ?? '',
        allowedCompanions: guest.allowedCompanions,
        partyName: guest.party?.name ?? '',
        notes: guest.notes ?? '',
      });
    } else {
      reset({
        fullName: '',
        email: '',
        whatsapp: '',
        allowedCompanions: 1,
        partyName: '',
        notes: '',
      });
    }
  }, [open, guest, reset]);

  const onSubmit = (values: GuestForm) => {
    setServerError(null);

    if (isEditing && guest) {
      update.mutate(
        { id: guest.id, input: values },
        {
          onSuccess: () => {
            toast.success('Convidado atualizado', `${values.fullName} foi salvo.`);
            onClose();
          },
          onError: (error) =>
            setServerError(
              error instanceof ApiRequestError ? error.message : 'Não foi possível salvar.',
            ),
        },
      );
      return;
    }

    create.mutate(values, {
      onSuccess: (data) => {
        setCreatedLink(data.inviteLink);
        toast.success('Convidado cadastrado!', 'O convite individual foi gerado automaticamente.');
      },
      onError: (error) =>
        setServerError(
          error instanceof ApiRequestError ? error.message : 'Não foi possível salvar.',
        ),
    });
  };

  const isPending = create.isPending || update.isPending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEditing ? 'Editar convidado' : 'Novo convidado'}
      description={
        isEditing
          ? 'Atualize os dados do convidado. O convite permanece o mesmo.'
          : 'Ao salvar, um convite individual com link exclusivo será gerado automaticamente.'
      }
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isPending}>
            {createdLink ? 'Fechar' : 'Cancelar'}
          </Button>
          {!createdLink && (
            <Button
              icon={isEditing ? <Save className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              onClick={handleSubmit(onSubmit)}
              loading={isPending}
            >
              {isEditing ? 'Salvar alterações' : 'Cadastrar convidado'}
            </Button>
          )}
        </>
      }
    >
      {createdLink ? (
        <div className="space-y-4">
          <div className="rounded-xl border-success-200 bg-success-50 p-4 text-sm text-success-700">
            Convidado cadastrado com sucesso. O convite individual já está pronto para envio.
          </div>

          <div>
            <p className="label">Link do convite</p>
            <div className="rounded-xl border-wedding-200 bg-wedding-50 p-3.5">
              <p className="break-all font-mono text-xs text-wedding-700">{createdLink}</p>
            </div>
            <p className="helper">
              Este link é pessoal e intransferível. Envie apenas para o convidado.
            </p>
          </div>

          <Button
            variant="secondary"
            fullWidth
            onClick={async () => {
              await navigator.clipboard.writeText(createdLink);
              toast.success('Link copiado!');
            }}
          >
            Copiar link
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <Input
            label="Nome completo"
            placeholder="Ex.: João da Silva"
            error={errors.fullName?.message}
            required
            autoFocus
            {...register('fullName')}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="E-mail"
              type="email"
              placeholder="joao@email.com"
              error={errors.email?.message}
              {...register('email')}
            />

            <Input
              label="WhatsApp"
              inputMode="tel"
              placeholder="(21) 99999-9999"
              error={errors.whatsapp?.message}
              {...register('whatsapp', {
                onChange: (event) => {
                  event.target.value = formatPhoneInput(event.target.value);
                },
              })}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Pessoas autorizadas"
              type="number"
              min={1}
              max={20}
              hint="Inclui o próprio convidado"
              error={errors.allowedCompanions?.message}
              required
              {...register('allowedCompanions')}
            />

            <Input
              label="Grupo / família"
              placeholder="Ex.: Família Oliveira"
              hint="Ajuda a organizar a lista"
              error={errors.partyName?.message}
              {...register('partyName')}
            />
          </div>

          <Textarea
            label="Observações"
            placeholder="Ex.: Cadeirante, restrição alimentar, etc."
            rows={2}
            error={errors.notes?.message}
            {...register('notes')}
          />

          {serverError && (
            <div
              role="alert"
              className="rounded-xl border-danger-200 bg-danger-50 px-4 py-3 text-sm text-danger-700"
            >
              {serverError}
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
