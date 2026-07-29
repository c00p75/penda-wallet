import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from '@/components/ui/sheet'
import { EmojiPicker } from '@/components/EmojiPicker'
import {
  useCreatePocketProvider,
  useCreatePocketType,
  useDeletePocketProvider,
  useDeletePocketType,
  usePocketProviders,
  usePocketTypes,
  useUpdatePocketProvider,
  useUpdatePocketType,
} from './hooks'

const ICON_CHOICES = ['💵', '📱', '🏦', '💳', '💰', '🪙', '🏧', '💼', '📈', '🌍', '🔖', '💠']

interface PocketAttribute {
  id: string
  name: string
  icon: string | null
}

interface AttributeInput {
  name: string
  icon?: string | null
}

interface PocketAttributeManagerProps {
  entityLabel: string
  namePlaceholder: string
  items: PocketAttribute[]
  onCreate: (input: AttributeInput) => Promise<unknown>
  onUpdate: (id: string, input: AttributeInput) => Promise<unknown>
  onDelete: (id: string) => Promise<unknown>
  isSubmitting: boolean
}

/**
 * Generic add/edit/delete manager for a wallet-scoped pocket attribute list
 * (Types or Providers) — both are the same name+icon shape, so one component
 * backs `PocketTypeManager` and `PocketProviderManager` below.
 */
function PocketAttributeManager({
  entityLabel,
  namePlaceholder,
  items,
  onCreate,
  onUpdate,
  onDelete,
  isSubmitting,
}: PocketAttributeManagerProps) {
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<PocketAttribute | null>(null)
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!formOpen) return
    setName(editing?.name ?? '')
    setIcon(editing?.icon ?? null)
  }, [formOpen, editing])

  function openCreate() {
    setEditing(null)
    setFormOpen(true)
  }

  function openEdit(item: PocketAttribute) {
    setEditing(item)
    setFormOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    try {
      if (editing) {
        await onUpdate(editing.id, { name: name.trim(), icon })
        toast(`${entityLabel} updated.`)
      } else {
        await onCreate({ name: name.trim(), icon })
        toast(`${entityLabel} added.`)
      }
      setFormOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleDelete() {
    if (!editing) return
    try {
      await onDelete(editing.id)
      toast(`${entityLabel} deleted.`)
      setFormOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openEdit(item)}
            className="flex items-center gap-2.5 rounded-2xl border border-border/60 p-2.5 text-left text-sm shadow-[var(--shadow-soft)] ring-1 ring-border/50 hover:bg-accent/60"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary/60 text-sm">
              {item.icon ?? '·'}
            </span>
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
          </button>
        ))}
      </div>

      {items.length === 0 && (
        <p className="text-xs text-muted-foreground">No {entityLabel.toLowerCase()}s yet.</p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start rounded-2xl shadow-[var(--shadow-soft)]"
        onClick={openCreate}
      >
        <Plus className="size-4" />
        Add {entityLabel.toLowerCase()}
      </Button>

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent side="bottom" className="max-h-[90svh] overflow-y-auto border-0 ring-0">
          <SheetHeader>
            <SheetTitle>
              {editing ? `Edit ${entityLabel.toLowerCase()}` : `New ${entityLabel.toLowerCase()}`}
            </SheetTitle>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-4 pb-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`pocket-attr-name-${entityLabel}`}>Name</Label>
              <Input
                id={`pocket-attr-name-${entityLabel}`}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={namePlaceholder}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Icon</Label>
              <EmojiPicker emojis={ICON_CHOICES} value={icon} onChange={setIcon} />
            </div>

            <SheetFooter className="flex-row gap-2 px-0">
              {editing && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setConfirmOpen(true)}
                  className="flex-1"
                >
                  Delete
                </Button>
              )}
              <SheetClose asChild>
                <Button type="button" variant="outline" className="flex-1">
                  Cancel
                </Button>
              </SheetClose>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {editing ? 'Save' : 'Add'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>

        {editing && (
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={`Delete "${editing.name}"?`}
            description={`Pockets using this ${entityLabel.toLowerCase()} will show "No ${entityLabel.toLowerCase()}" until you pick a new one.`}
            confirmLabel="Delete"
            isPending={isSubmitting}
            onConfirm={() => {
              setConfirmOpen(false)
              void handleDelete()
            }}
          />
        )}
      </Sheet>
    </div>
  )
}

export function PocketTypeManager({ walletId }: { walletId: string | undefined }) {
  const { data: types = [] } = usePocketTypes(walletId)
  const createType = useCreatePocketType(walletId)
  const updateType = useUpdatePocketType(walletId)
  const deleteType = useDeletePocketType(walletId)

  return (
    <PocketAttributeManager
      entityLabel="Type"
      namePlaceholder="Crypto wallet"
      items={types}
      onCreate={(input) => createType.mutateAsync(input)}
      onUpdate={(id, input) => updateType.mutateAsync({ id, input })}
      onDelete={(id) => deleteType.mutateAsync(id)}
      isSubmitting={createType.isPending || updateType.isPending || deleteType.isPending}
    />
  )
}

export function PocketProviderManager({ walletId }: { walletId: string | undefined }) {
  const { data: providers = [] } = usePocketProviders(walletId)
  const createProvider = useCreatePocketProvider(walletId)
  const updateProvider = useUpdatePocketProvider(walletId)
  const deleteProvider = useDeletePocketProvider(walletId)

  return (
    <PocketAttributeManager
      entityLabel="Provider"
      namePlaceholder="Revolut"
      items={providers}
      onCreate={(input) => createProvider.mutateAsync(input)}
      onUpdate={(id, input) => updateProvider.mutateAsync({ id, input })}
      onDelete={(id) => deleteProvider.mutateAsync(id)}
      isSubmitting={createProvider.isPending || updateProvider.isPending || deleteProvider.isPending}
    />
  )
}
