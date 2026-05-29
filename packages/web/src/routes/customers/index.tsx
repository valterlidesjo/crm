import { useState } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { PageContainer } from "@/components/layout/page-container";
import { AddCustomerDialog } from "@/features/customers/components/add-customer-dialog";
import { EditCustomerDialog } from "@/features/customers/components/edit-customer-dialog";
import { CustomerList } from "@/features/customers/components/customer-list";
import { useCustomers } from "@/features/customers/hooks/use-customers";
import { Plus } from "lucide-react";
import type { Customer, ContactUser } from "@crm/shared";

export const Route = createFileRoute("/customers/")({
  component: CustomersPage,
});

function CustomersPage() {
  const { t } = useTranslation("customers");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editingUser, setEditingUser] = useState<ContactUser | null>(null);
  const { customers, loading, addCustomer, updateCustomer, updateUser, fetchContactUser } = useCustomers();

  async function handleAddCustomer(data: Parameters<typeof addCustomer>[0]) {
    await addCustomer(data);
    setAddOpen(false);
  }

  async function handleEdit(customer: Customer) {
    setEditingCustomer(customer);
    const user = await fetchContactUser(customer.id);
    setEditingUser(user);
    setEditOpen(true);
  }

  async function handleSaveCustomer(id: string, data: Parameters<typeof updateCustomer>[1]) {
    await updateCustomer(id, data);
    setEditOpen(false);
  }

  async function handleSaveUser(id: string, data: Parameters<typeof updateUser>[1]) {
    await updateUser(id, data);
    setEditOpen(false);
  }

  return (
    <PageContainer
      title={t("page.title")}
      description={t("page.description")}
    >
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("page.addCustomer")}
        </button>
      </div>

      <CustomerList customers={customers} loading={loading} onEdit={handleEdit} />

      <AddCustomerDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSubmit={handleAddCustomer}
      />

      <EditCustomerDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        customer={editingCustomer}
        contactUser={editingUser}
        onSaveCustomer={handleSaveCustomer}
        onSaveUser={handleSaveUser}
      />
    </PageContainer>
  );
}
