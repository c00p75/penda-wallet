import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from './hooks'
import { CategoryForm } from './CategoryForm'
import type { Category, CategoryInput } from './types'

interface CategoryManagerProps {
  walletId: string | undefined
}

export function CategoryManager({ walletId }: CategoryManagerProps) {
  const { data: categories = [] } = useCategories(walletId)
  const createCategory = useCreateCategory(walletId)
  const updateCategory = useUpdateCategory(walletId)
  const deleteCategory = useDeleteCategory(walletId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)

  const custom = categories.filter((c) => !c.is_system)
  const system = categories.filter((c) => c.is_system)

  async function handleSubmit(input: CategoryInput) {
    try {
      if (editing) {
        await updateCategory.mutateAsync({ id: editing.id, input })
        toast('Category updated.')
      } else {
        await createCategory.mutateAsync(input)
        toast('Category added.')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  async function handleDelete() {
    if (!editing) return
    try {
      await deleteCategory.mutateAsync(editing.id)
      toast('Category deleted.')
      setFormOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.')
    }
  }

  function CategoryRow({ category, editable }: { category: Category; editable: boolean }) {
    return (
      <button
        type="button"
        disabled={!editable}
        onClick={() => {
          setEditing(category)
          setFormOpen(true)
        }}
        className="flex items-center gap-2.5 rounded-lg border p-2.5 text-left text-sm disabled:cursor-default enabled:hover:bg-accent"
      >
        {category.icon ? (
          <span
            className="grid size-6 shrink-0 place-items-center rounded-full text-sm"
            style={{ backgroundColor: `color-mix(in srgb, ${category.color ?? 'var(--muted-foreground)'} 20%, transparent)` }}
          >
            {category.icon}
          </span>
        ) : (
          <span
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: category.color ?? 'var(--muted-foreground)' }}
          />
        )}
        <span className="min-w-0 flex-1 truncate">{category.name}</span>
        {!editable && <span className="shrink-0 text-xs text-muted-foreground">Default</span>}
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {custom.map((c) => (
          <CategoryRow key={c.id} category={c} editable />
        ))}
        {system.map((c) => (
          <CategoryRow key={c.id} category={c} editable={false} />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => {
          setEditing(null)
          setFormOpen(true)
        }}
      >
        <Plus className="size-4" />
        Add category
      </Button>

      <CategoryForm
        open={formOpen}
        onOpenChange={setFormOpen}
        category={editing}
        onSubmit={handleSubmit}
        onDelete={editing && !editing.is_system ? handleDelete : undefined}
        isSubmitting={createCategory.isPending || updateCategory.isPending}
      />
    </div>
  )
}
