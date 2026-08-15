-- -----------------------------------------------------------------------------
-- pages_set_scope - BEFORE INSERT / UPDATE OF collection_id, parent_id
-- -----------------------------------------------------------------------------

create trigger pages_set_scope
  before insert or update of collection_id, parent_id on public.pages
  for each row execute function public.pages_set_scope();

-- -----------------------------------------------------------------------------
-- pages_tree_sync - AFTER UPDATE OF parent_id, published_at
-- -----------------------------------------------------------------------------

create trigger pages_tree_sync
  after update of parent_id, published_at on public.pages
  for each row
  when (old.parent_id    is distinct from new.parent_id
     or old.published_at is distinct from new.published_at)
  execute function public.pages_after_tree_change();

-- -----------------------------------------------------------------------------
-- attachments_set_scope - BEFORE INSERT / UPDATE OF page_id
-- -----------------------------------------------------------------------------

create trigger attachments_set_scope
  before insert or update of page_id on public.attachments
  for each row execute function public.attachments_set_scope();

-- -----------------------------------------------------------------------------
-- Editorship bookkeeping
-- -----------------------------------------------------------------------------

create trigger pages_stamp_editor
  before update of title, content, icon, cover_path on public.pages
  for each row execute function public.pages_stamp_editor();

-- -----------------------------------------------------------------------------
-- Soft-delete guards
-- -----------------------------------------------------------------------------

create trigger collections_guard_trash
  before update on public.collections
  for each row execute function public.collections_guard_trash();

create trigger pages_guard_trash
  before update on public.pages
  for each row execute function public.pages_guard_trash();

create trigger collections_cascade_trash
  after update of deleted_at on public.collections
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function public.collections_cascade_trash();
 