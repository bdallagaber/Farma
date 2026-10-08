-- Preserve pharmacy transaction history when products or employees are deleted.
-- Product IDs that are primary keys remain immutable historical IDs; operational rows keep snapshots.

CREATE TABLE IF NOT EXISTS public.deleted_products (
  product_id uuid PRIMARY KEY,
  display_name text NOT NULL,
  product_snapshot jsonb NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid
);

CREATE TABLE IF NOT EXISTS public.deleted_employees (
  user_id uuid PRIMARY KEY,
  full_name text NOT NULL,
  email text,
  role text,
  profile_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid
);

ALTER TABLE public.deleted_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deleted_employees ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.deleted_products, public.deleted_employees TO authenticated;
GRANT UPDATE (deleted_by) ON public.deleted_employees TO service_role;
DROP POLICY IF EXISTS deleted_products_admin_read ON public.deleted_products;
CREATE POLICY deleted_products_admin_read ON public.deleted_products
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS deleted_employees_admin_read ON public.deleted_employees;
CREATE POLICY deleted_employees_admin_read ON public.deleted_employees
  FOR SELECT TO authenticated USING (public.is_admin());

-- Transaction-level snapshots. Snapshot IDs are intentionally not foreign keys.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS product_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS product_name_snapshot text,
  ADD COLUMN IF NOT EXISTS product_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS employee_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS product_id_snapshot uuid;
ALTER TABLE public.customer_followups
  ADD COLUMN IF NOT EXISTS product_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS product_name_snapshot text,
  ADD COLUMN IF NOT EXISTS created_by_name_snapshot text,
  ADD COLUMN IF NOT EXISTS assigned_to_name_snapshot text,
  ADD COLUMN IF NOT EXISTS completed_by_name_snapshot text;
ALTER TABLE public.customer_followup_products
  ADD COLUMN IF NOT EXISTS product_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS product_name_snapshot text;
ALTER TABLE public.product_costs
  ADD COLUMN IF NOT EXISTS product_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS product_name_snapshot text;
ALTER TABLE public.order_checklist
  ADD COLUMN IF NOT EXISTS product_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS product_name_snapshot text;

-- Employee labels for durable business and audit records.
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS employee_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;
ALTER TABLE public.attendance_requests
  ADD COLUMN IF NOT EXISTS employee_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text,
  ADD COLUMN IF NOT EXISTS created_by_name_snapshot text,
  ADD COLUMN IF NOT EXISTS reviewed_by_name_snapshot text;
ALTER TABLE public.employee_shift_schedule
  ADD COLUMN IF NOT EXISTS employee_id_snapshot uuid,
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS created_by_name_snapshot text;
ALTER TABLE public.customer_ledger ADD COLUMN IF NOT EXISTS created_by_name_snapshot text;
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS created_by_name_snapshot text;
ALTER TABLE public.product_costs ADD COLUMN IF NOT EXISTS updated_by_name_snapshot text;
ALTER TABLE public.order_checklist ADD COLUMN IF NOT EXISTS updated_by_name_snapshot text;
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS created_by_name_snapshot text,
  ADD COLUMN IF NOT EXISTS approved_by_name_snapshot text;
ALTER TABLE public.invoice_audit_log ADD COLUMN IF NOT EXISTS edited_by_name_snapshot text;
ALTER TABLE public.inventory_audit_log ADD COLUMN IF NOT EXISTS changed_by_name_snapshot text;
ALTER TABLE public.attendance_audit_log
  ADD COLUMN IF NOT EXISTS employee_name_snapshot text,
  ADD COLUMN IF NOT EXISTS changed_by_name_snapshot text;
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS created_by_name_snapshot text,
  ADD COLUMN IF NOT EXISTS received_by_name_snapshot text,
  ADD COLUMN IF NOT EXISTS cancelled_by_name_snapshot text;

-- Backfill existing sales before changing any relationships.
UPDATE public.sales s
SET product_id_snapshot = COALESCE(s.product_id_snapshot, s.product_id),
    product_name_snapshot = COALESCE(s.product_name_snapshot, p.name),
    product_snapshot = COALESCE(s.product_snapshot, jsonb_build_object(
      'id',p.id,'name',p.name,'name_en',p.name_en,'barcode',p.barcode,
      'unit_small',p.unit_small,'unit_medium',p.unit_medium,'unit_medium_to_small',p.unit_medium_to_small,
      'unit_large',p.unit_large,'unit_large_to_medium',p.unit_large_to_medium,
      'default_sale_price',p.default_sale_price))
FROM public.products p
WHERE p.id = s.product_id;
UPDATE public.sales s
SET employee_id_snapshot = COALESCE(s.employee_id_snapshot, s.employee_id),
    employee_name_snapshot = COALESCE(s.employee_name_snapshot, p.full_name)
FROM public.profiles p
WHERE p.id = s.employee_id;
UPDATE public.purchase_order_items i
SET product_id_snapshot = COALESCE(i.product_id_snapshot, i.product_id),
    product_name_snapshot = COALESCE(NULLIF(i.product_name_snapshot, ''), p.name)
FROM public.products p
WHERE p.id = i.product_id;
UPDATE public.customer_followups f
SET product_id_snapshot = COALESCE(f.product_id_snapshot, f.product_id),
    product_name_snapshot = COALESCE(f.product_name_snapshot, p.name)
FROM public.products p
WHERE p.id = f.product_id;
UPDATE public.customer_followup_products f
SET product_id_snapshot = COALESCE(f.product_id_snapshot, f.product_id),
    product_name_snapshot = COALESCE(f.product_name_snapshot, p.name)
FROM public.products p
WHERE p.id = f.product_id;
UPDATE public.product_costs x
SET product_id_snapshot = COALESCE(x.product_id_snapshot, x.product_id),
    product_name_snapshot = COALESCE(x.product_name_snapshot, p.name)
FROM public.products p WHERE p.id = x.product_id;
UPDATE public.order_checklist x
SET product_id_snapshot = COALESCE(x.product_id_snapshot, x.product_id),
    product_name_snapshot = COALESCE(x.product_name_snapshot, p.name)
FROM public.products p WHERE p.id = x.product_id;
UPDATE public.customer_followups f SET assigned_to_name_snapshot = COALESCE(f.assigned_to_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = f.assigned_to;
UPDATE public.customer_followups f SET completed_by_name_snapshot = COALESCE(f.completed_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = f.completed_by;

UPDATE public.attendance a
SET employee_id_snapshot = COALESCE(a.employee_id_snapshot, a.employee_id),
    employee_name_snapshot = COALESCE(a.employee_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = a.employee_id;
UPDATE public.attendance_requests r
SET employee_id_snapshot = COALESCE(r.employee_id_snapshot, r.employee_id),
    employee_name_snapshot = COALESCE(r.employee_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = r.employee_id;
UPDATE public.attendance_requests r
SET created_by_name_snapshot = COALESCE(r.created_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = r.created_by;
UPDATE public.attendance_requests r
SET reviewed_by_name_snapshot = COALESCE(r.reviewed_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = r.reviewed_by;
UPDATE public.employee_shift_schedule s
SET employee_id_snapshot = COALESCE(s.employee_id_snapshot, s.employee_id),
    employee_name_snapshot = COALESCE(s.employee_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = s.employee_id;
UPDATE public.expenses x SET created_by_name_snapshot = COALESCE(x.created_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.created_by;
UPDATE public.customer_ledger x SET created_by_name_snapshot = COALESCE(x.created_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.created_by;
UPDATE public.customer_followups x SET created_by_name_snapshot = COALESCE(x.created_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.created_by;
UPDATE public.products x SET created_by_name_snapshot = COALESCE(x.created_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.created_by;
UPDATE public.product_costs x SET updated_by_name_snapshot = COALESCE(x.updated_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.updated_by;
UPDATE public.order_checklist x SET updated_by_name_snapshot = COALESCE(x.updated_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.updated_by;
UPDATE public.invoices x SET created_by_name_snapshot = COALESCE(x.created_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.created_by;
UPDATE public.invoices x SET approved_by_name_snapshot = COALESCE(x.approved_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.approved_by;
UPDATE public.invoice_audit_log x SET edited_by_name_snapshot = COALESCE(x.edited_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.edited_by;
UPDATE public.inventory_audit_log x SET changed_by_name_snapshot = COALESCE(x.changed_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.changed_by;
UPDATE public.attendance_audit_log x SET employee_name_snapshot = COALESCE(x.employee_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.employee_id;
UPDATE public.attendance_audit_log x SET changed_by_name_snapshot = COALESCE(x.changed_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.changed_by;
UPDATE public.purchase_orders x SET created_by_name_snapshot = COALESCE(x.created_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.created_by;
UPDATE public.purchase_orders x SET received_by_name_snapshot = COALESCE(x.received_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.received_by;
UPDATE public.purchase_orders x SET cancelled_by_name_snapshot = COALESCE(x.cancelled_by_name_snapshot, p.full_name)
FROM public.profiles p WHERE p.id = x.cancelled_by;

-- Product references are nulled where the schema permits; PK-backed historical IDs are left intact.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_product_id_fkey;
ALTER TABLE public.sales ADD CONSTRAINT sales_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_product_id_fkey;
ALTER TABLE public.purchase_order_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
ALTER TABLE public.customer_followups DROP CONSTRAINT IF EXISTS customer_followups_product_id_fkey;
ALTER TABLE public.customer_followups ADD CONSTRAINT customer_followups_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;
-- These product IDs are part of primary keys; retain them as historical IDs, not live references.
ALTER TABLE public.customer_followup_products DROP CONSTRAINT IF EXISTS customer_followup_products_product_id_fkey;
ALTER TABLE public.product_costs DROP CONSTRAINT IF EXISTS product_costs_product_id_fkey;
ALTER TABLE public.order_checklist DROP CONSTRAINT IF EXISTS order_checklist_product_id_fkey;

-- Employee/account references become optional on historical rows; names and IDs remain in snapshot fields.
ALTER TABLE public.sales ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.attendance ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.attendance_requests ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.employee_shift_schedule ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.purchase_orders ALTER COLUMN created_by DROP NOT NULL;

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_employee_id_fkey;
ALTER TABLE public.sales ADD CONSTRAINT sales_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.attendance DROP CONSTRAINT IF EXISTS attendance_employee_id_fkey;
ALTER TABLE public.attendance ADD CONSTRAINT attendance_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.attendance_requests DROP CONSTRAINT IF EXISTS attendance_requests_employee_id_fkey;
ALTER TABLE public.attendance_requests ADD CONSTRAINT attendance_requests_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.employee_shift_schedule DROP CONSTRAINT IF EXISTS employee_shift_schedule_employee_id_fkey;
ALTER TABLE public.employee_shift_schedule ADD CONSTRAINT employee_shift_schedule_employee_id_fkey
  FOREIGN KEY (employee_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.attendance_requests DROP CONSTRAINT IF EXISTS attendance_requests_created_by_fkey;
ALTER TABLE public.attendance_requests ADD CONSTRAINT attendance_requests_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.customer_followups DROP CONSTRAINT IF EXISTS customer_followups_created_by_fkey;
ALTER TABLE public.customer_followups ADD CONSTRAINT customer_followups_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.customer_ledger DROP CONSTRAINT IF EXISTS customer_ledger_created_by_fkey;
ALTER TABLE public.customer_ledger ADD CONSTRAINT customer_ledger_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_created_by_fkey;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.inventory_audit_log DROP CONSTRAINT IF EXISTS inventory_audit_log_changed_by_fkey;
ALTER TABLE public.inventory_audit_log ADD CONSTRAINT inventory_audit_log_changed_by_fkey
  FOREIGN KEY (changed_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_audit_log DROP CONSTRAINT IF EXISTS invoice_audit_log_edited_by_fkey;
ALTER TABLE public.invoice_audit_log ADD CONSTRAINT invoice_audit_log_edited_by_fkey
  FOREIGN KEY (edited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_created_by_fkey;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.order_checklist DROP CONSTRAINT IF EXISTS order_checklist_updated_by_fkey;
ALTER TABLE public.order_checklist ADD CONSTRAINT order_checklist_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.product_costs DROP CONSTRAINT IF EXISTS product_costs_updated_by_fkey;
ALTER TABLE public.product_costs ADD CONSTRAINT product_costs_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_created_by_fkey;
ALTER TABLE public.products ADD CONSTRAINT products_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_created_by_fkey;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_received_by_fkey;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_received_by_fkey
  FOREIGN KEY (received_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_cancelled_by_fkey;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_cancelled_by_fkey
  FOREIGN KEY (cancelled_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Keep full product context in sales and a searchable deletion archive.
CREATE OR REPLACE FUNCTION public.capture_sales_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_product public.products%ROWTYPE;
  v_employee_name text;
BEGIN
  IF NEW.product_id IS NOT NULL THEN
    SELECT * INTO v_product FROM public.products WHERE id = NEW.product_id;
    IF FOUND THEN
      NEW.product_id_snapshot := COALESCE(NEW.product_id_snapshot, NEW.product_id);
      NEW.product_name_snapshot := COALESCE(NEW.product_name_snapshot, v_product.name);
      NEW.product_snapshot := COALESCE(NEW.product_snapshot, jsonb_build_object(
        'id',v_product.id,'name',v_product.name,'name_en',v_product.name_en,'barcode',v_product.barcode,
        'unit_small',v_product.unit_small,'unit_medium',v_product.unit_medium,'unit_medium_to_small',v_product.unit_medium_to_small,
        'unit_large',v_product.unit_large,'unit_large_to_medium',v_product.unit_large_to_medium,
        'default_sale_price',v_product.default_sale_price));
    END IF;
  END IF;
  IF NEW.employee_id IS NOT NULL THEN
    SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = NEW.employee_id;
    NEW.employee_id_snapshot := COALESCE(NEW.employee_id_snapshot, NEW.employee_id);
    NEW.employee_name_snapshot := COALESCE(NEW.employee_name_snapshot, v_employee_name);
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS sales_capture_snapshots ON public.sales;
CREATE TRIGGER sales_capture_snapshots
  BEFORE INSERT OR UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.capture_sales_snapshots();

CREATE OR REPLACE FUNCTION public.capture_deleted_product_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.deleted_products(product_id, display_name, product_snapshot, deleted_by)
  VALUES (OLD.id, OLD.name, to_jsonb(OLD), auth.uid())
  ON CONFLICT (product_id) DO UPDATE
    SET display_name = EXCLUDED.display_name,
        product_snapshot = EXCLUDED.product_snapshot,
        deleted_at = now(),
        deleted_by = EXCLUDED.deleted_by;

  UPDATE public.sales
  SET product_id_snapshot = COALESCE(product_id_snapshot, OLD.id),
      product_name_snapshot = COALESCE(product_name_snapshot, OLD.name),
      product_snapshot = COALESCE(product_snapshot, jsonb_build_object(
        'id',OLD.id,'name',OLD.name,'name_en',OLD.name_en,'barcode',OLD.barcode,
        'unit_small',OLD.unit_small,'unit_medium',OLD.unit_medium,'unit_medium_to_small',OLD.unit_medium_to_small,
        'unit_large',OLD.unit_large,'unit_large_to_medium',OLD.unit_large_to_medium,
        'default_sale_price',OLD.default_sale_price))
  WHERE product_id = OLD.id;
  UPDATE public.purchase_order_items
  SET product_id_snapshot = COALESCE(product_id_snapshot, OLD.id),
      product_name_snapshot = COALESCE(NULLIF(product_name_snapshot, ''), OLD.name)
  WHERE product_id = OLD.id;
  UPDATE public.customer_followups
  SET product_id_snapshot = COALESCE(product_id_snapshot, OLD.id),
      product_name_snapshot = COALESCE(product_name_snapshot, OLD.name)
  WHERE product_id = OLD.id;
  UPDATE public.customer_followup_products
  SET product_id_snapshot = COALESCE(product_id_snapshot, OLD.id),
      product_name_snapshot = COALESCE(product_name_snapshot, OLD.name)
  WHERE product_id = OLD.id;
  UPDATE public.product_costs
  SET product_id_snapshot = COALESCE(product_id_snapshot, OLD.id),
      product_name_snapshot = COALESCE(product_name_snapshot, OLD.name)
  WHERE product_id = OLD.id;
  UPDATE public.order_checklist
  SET product_id_snapshot = COALESCE(product_id_snapshot, OLD.id),
      product_name_snapshot = COALESCE(product_name_snapshot, OLD.name)
  WHERE product_id = OLD.id;
  RETURN OLD;
END;
$function$;
DROP TRIGGER IF EXISTS products_capture_delete_history ON public.products;
CREATE TRIGGER products_capture_delete_history
  BEFORE DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.capture_deleted_product_history();

-- Capture employee identity before Auth cascades into public.profiles.
CREATE OR REPLACE FUNCTION public.capture_deleted_employee_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_name text;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = OLD.id;
  v_name := COALESCE(v_profile.full_name, OLD.raw_user_meta_data ->> 'full_name', OLD.email, 'موظف محذوف');
  INSERT INTO public.deleted_employees(user_id, full_name, email, role, profile_snapshot, deleted_by)
  VALUES (OLD.id, v_name, COALESCE(v_profile.email, OLD.email), v_profile.role::text,
          CASE WHEN v_profile.id IS NULL THEN jsonb_build_object('id', OLD.id, 'email', OLD.email, 'full_name', v_name)
               ELSE to_jsonb(v_profile) END,
          auth.uid())
  ON CONFLICT (user_id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        profile_snapshot = EXCLUDED.profile_snapshot,
        deleted_at = now(),
        deleted_by = EXCLUDED.deleted_by;

  PERFORM set_config('app.farma_auth_user_delete', OLD.id::text, true);

  UPDATE public.sales SET employee_id_snapshot = COALESCE(employee_id_snapshot, OLD.id),
      employee_name_snapshot = COALESCE(employee_name_snapshot, v_name) WHERE employee_id = OLD.id;
  UPDATE public.attendance SET employee_id_snapshot = COALESCE(employee_id_snapshot, OLD.id),
      employee_name_snapshot = COALESCE(employee_name_snapshot, v_name) WHERE employee_id = OLD.id;
  UPDATE public.attendance_requests SET employee_id_snapshot = COALESCE(employee_id_snapshot, OLD.id),
      employee_name_snapshot = COALESCE(employee_name_snapshot, v_name) WHERE employee_id = OLD.id;
  UPDATE public.attendance_requests SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, v_name)
      WHERE created_by = OLD.id;
  UPDATE public.attendance_requests SET reviewed_by_name_snapshot = COALESCE(reviewed_by_name_snapshot, v_name)
      WHERE reviewed_by = OLD.id;
  UPDATE public.employee_shift_schedule SET employee_id_snapshot = COALESCE(employee_id_snapshot, OLD.id),
      employee_name_snapshot = COALESCE(employee_name_snapshot, v_name) WHERE employee_id = OLD.id;
  UPDATE public.expenses SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, v_name) WHERE created_by = OLD.id;
  UPDATE public.customer_ledger SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, v_name) WHERE created_by = OLD.id;
  UPDATE public.products SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, v_name) WHERE created_by = OLD.id;
  UPDATE public.product_costs SET updated_by_name_snapshot = COALESCE(updated_by_name_snapshot, v_name) WHERE updated_by = OLD.id;
  UPDATE public.order_checklist SET updated_by_name_snapshot = COALESCE(updated_by_name_snapshot, v_name) WHERE updated_by = OLD.id;
  UPDATE public.invoices SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, v_name) WHERE created_by = OLD.id;
  UPDATE public.invoices SET approved_by_name_snapshot = COALESCE(approved_by_name_snapshot, v_name) WHERE approved_by = OLD.id;
  UPDATE public.invoice_audit_log SET edited_by_name_snapshot = COALESCE(edited_by_name_snapshot, v_name) WHERE edited_by = OLD.id;
  UPDATE public.inventory_audit_log SET changed_by_name_snapshot = COALESCE(changed_by_name_snapshot, v_name) WHERE changed_by = OLD.id;
  UPDATE public.attendance_audit_log SET employee_name_snapshot = COALESCE(employee_name_snapshot, v_name) WHERE employee_id = OLD.id;
  UPDATE public.attendance_audit_log SET changed_by_name_snapshot = COALESCE(changed_by_name_snapshot, v_name) WHERE changed_by = OLD.id;
  UPDATE public.purchase_orders SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, v_name) WHERE created_by = OLD.id;
  UPDATE public.purchase_orders SET received_by_name_snapshot = COALESCE(received_by_name_snapshot, v_name) WHERE received_by = OLD.id;
  UPDATE public.purchase_orders SET cancelled_by_name_snapshot = COALESCE(cancelled_by_name_snapshot, v_name) WHERE cancelled_by = OLD.id;
  UPDATE public.customer_followups SET created_by_name_snapshot = COALESCE(created_by_name_snapshot, v_name) WHERE created_by = OLD.id;
  UPDATE public.customer_followups SET assigned_to_name_snapshot = COALESCE(assigned_to_name_snapshot, v_name) WHERE assigned_to = OLD.id;
  UPDATE public.customer_followups SET completed_by_name_snapshot = COALESCE(completed_by_name_snapshot, v_name) WHERE completed_by = OLD.id;

  RETURN OLD;
END;
$function$;
DROP TRIGGER IF EXISTS auth_users_capture_delete_history ON auth.users;
CREATE TRIGGER auth_users_capture_delete_history
  BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.capture_deleted_employee_history();

-- Disallow deleting a profile row directly; account removal must go through Supabase Auth,
-- which runs the history-preserving auth.users trigger above.
CREATE OR REPLACE FUNCTION public.guard_profile_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF current_setting('app.farma_auth_user_delete', true) IS DISTINCT FROM OLD.id::text THEN
    RAISE EXCEPTION 'احذف حساب الموظف من مسار حذف الحساب، وليس من جدول profiles مباشرة.'
      USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$function$;
DROP TRIGGER IF EXISTS profiles_guard_direct_delete ON public.profiles;
CREATE TRIGGER profiles_guard_direct_delete
  BEFORE DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_delete();

-- Recreate the invoice RPC so deleted product/employee rows still show in existing history.
CREATE OR REPLACE FUNCTION public.get_invoices_page(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_time_from time without time zone DEFAULT NULL,
  p_time_to time without time zone DEFAULT NULL,
  p_employees uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
declare
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select exists(select 1 from profiles where id = v_uid and role = 'admin') into v_is_admin;

  with q as (
    select case when p_search is null or btrim(p_search) = '' then null
      else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%' end as pat
  ),
  my_sales as (
    select * from sales s where v_is_admin or s.employee_id = v_uid
  ),
  g as (
    select coalesce(s.sale_group_id::text, 'single-' || s.id::text) as key,
      s.sale_group_id,
      (array_agg(s.id))[1] as first_id,
      max(s.created_at) as created_at,
      (array_agg(COALESCE(s.employee_id_snapshot, s.employee_id) order by s.created_at desc))[1] as employee_id,
      (array_agg(COALESCE(s.employee_name_snapshot, '—') order by s.created_at desc))[1] as employee_name_snapshot,
      (array_agg(s.customer_id order by s.created_at desc))[1] as s_customer_id,
      sum(s.sale_price) as total
    from my_sales s
    group by 1, 2
  ),
  base as (
    select g.*, i.invoice_number, i.notes, i.discount_type, i.discount_value, i.subtotal,
      i.discount_amount, i.total as i_total, i.paid_amount, i.remaining_amount, i.payment_status,
      (i.sale_group_id is not null) as has_invoice,
      case when i.sale_group_id is not null then i.customer_id else g.s_customer_id end as eff_customer_id,
      c.name as customer_name, coalesce(pe.full_name, g.employee_name_snapshot) as employee_name,
      (g.created_at at time zone 'Africa/Cairo') as local_ts
    from g
    left join invoices i on i.sale_group_id = g.sale_group_id
    left join customers c on c.id = case when i.sale_group_id is not null then i.customer_id else g.s_customer_id end
    left join profiles pe on pe.id = g.employee_id
  ),
  filtered as (
    select b.* from base b, q
    where v_is_admin
      and (p_employees is null or cardinality(p_employees) = 0 or b.employee_id = any(p_employees))
      and (case
        when p_date_from is not null and p_date_to is not null and p_time_from is not null and p_time_to is not null
          then date_trunc('minute', b.local_ts) between (p_date_from + p_time_from) and (p_date_to + p_time_to)
        else (p_date_from is null or b.local_ts::date >= p_date_from)
          and (p_date_to is null or b.local_ts::date <= p_date_to)
          and (p_time_from is null or date_trunc('minute', b.local_ts)::time >= p_time_from)
          and (p_time_to is null or date_trunc('minute', b.local_ts)::time <= p_time_to)
      end)
      and (q.pat is null or coalesce(b.invoice_number::text, '') ilike q.pat
        or coalesce(b.customer_name, 'كاش') ilike q.pat or coalesce(b.employee_name, '') ilike q.pat
        or exists (select 1 from my_sales s2 left join products p on p.id = s2.product_id
          where ((b.sale_group_id is not null and s2.sale_group_id = b.sale_group_id)
            or (b.sale_group_id is null and s2.id = b.first_id))
            and (coalesce(p.name, s2.product_name_snapshot, '') ilike q.pat
              or coalesce(p.name_en, s2.product_snapshot ->> 'name_en', '') ilike q.pat)))
    union all
    select b.* from base b, q
    where not v_is_admin
      and (p_employees is null or cardinality(p_employees) = 0 or b.employee_id = any(p_employees))
      and (case
        when p_date_from is not null and p_date_to is not null and p_time_from is not null and p_time_to is not null
          then date_trunc('minute', b.local_ts) between (p_date_from + p_time_from) and (p_date_to + p_time_to)
        else (p_date_from is null or b.local_ts::date >= p_date_from)
          and (p_date_to is null or b.local_ts::date <= p_date_to)
          and (p_time_from is null or date_trunc('minute', b.local_ts)::time >= p_time_from)
          and (p_time_to is null or date_trunc('minute', b.local_ts)::time <= p_time_to)
      end)
      and (q.pat is null or coalesce(b.invoice_number::text, '') ilike q.pat
        or coalesce(b.customer_name, 'كاش') ilike q.pat or coalesce(b.employee_name, '') ilike q.pat
        or exists (select 1 from my_sales s2 left join products p on p.id = s2.product_id
          where ((b.sale_group_id is not null and s2.sale_group_id = b.sale_group_id)
            or (b.sale_group_id is null and s2.id = b.first_id))
            and (coalesce(p.name, s2.product_name_snapshot, '') ilike q.pat
              or coalesce(p.name_en, s2.product_snapshot ->> 'name_en', '') ilike q.pat)))
  )
  select jsonb_build_object(
    'count', (select count(*) from filtered),
    'sum', (select coalesce(sum(coalesce(i_total, total)), 0) from filtered),
    'rows', (select coalesce(jsonb_agg(r.j order by r.created_at desc, r.key), '[]'::jsonb)
      from (select f.created_at, f.key, jsonb_build_object(
        'key', f.key, 'sale_group_id', f.sale_group_id, 'created_at', f.created_at,
        'customer', coalesce(f.customer_name, 'كاش'), 'customer_id', f.eff_customer_id,
        'invoiceNumber', f.invoice_number, 'notes', coalesce(f.notes, ''),
        'discountType', coalesce(f.discount_type, 'none'), 'discountValue', coalesce(f.discount_value, 0),
        'subtotal', f.subtotal, 'discountAmount', coalesce(f.discount_amount, 0),
        'invoiceTotal', f.i_total, 'paidAmount', coalesce(f.paid_amount, 0),
        'remainingAmount', coalesce(f.remaining_amount, 0), 'paymentStatus', coalesce(f.payment_status, 'unpaid'),
        'hasInvoiceRow', f.has_invoice, 'employee', coalesce(f.employee_name, '—'),
        'employee_id', f.employee_id, 'total', f.total, 'auditLog', '[]'::jsonb,
        'items', (select coalesce(jsonb_agg(jsonb_build_object(
          'id', s.id, 'sale_group_id', s.sale_group_id, 'product_id', s.product_id,
          'product_id_snapshot', s.product_id_snapshot,
          'product_name_snapshot', s.product_name_snapshot,
          'product_snapshot', s.product_snapshot,
          'quantity', s.quantity, 'unit_sold', s.unit_sold, 'sale_price', s.sale_price,
          'original_sale_price', s.original_sale_price, 'created_at', s.created_at,
          'employee_id', s.employee_id, 'employee_id_snapshot', s.employee_id_snapshot,
          'employee_name_snapshot', s.employee_name_snapshot, 'customer_id', s.customer_id,
          'products', case when p.id is null then
            coalesce(s.product_snapshot, case when s.product_name_snapshot is null then null
              else jsonb_build_object('name', s.product_name_snapshot) end)
            else jsonb_build_object('name', p.name, 'name_en', p.name_en, 'unit_small', p.unit_small,
              'unit_medium', p.unit_medium, 'unit_large', p.unit_large,
              'unit_medium_to_small', p.unit_medium_to_small, 'unit_large_to_medium', p.unit_large_to_medium)
          end
        ) order by s.created_at desc), '[]'::jsonb)
        from my_sales s left join products p on p.id = s.product_id
        where (f.sale_group_id is not null and s.sale_group_id = f.sale_group_id)
          or (f.sale_group_id is null and s.id = f.first_id))
      ) as j from (select * from filtered order by created_at desc, key
        limit greatest(p_limit, 1) offset greatest(p_offset, 0)) f) r)
  ) into v_result;
  return v_result;
end;
$function$;
