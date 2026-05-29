import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddCustomerDialog } from "./add-customer-dialog";

describe("AddCustomerDialog", () => {
  const mockOnSubmit = vi.fn();
  const mockOnOpenChange = vi.fn();
  const user = userEvent.setup();

  function renderDialog(open = true) {
    return render(
      <AddCustomerDialog
        open={open}
        onOpenChange={mockOnOpenChange}
        onSubmit={mockOnSubmit}
      />
    );
  }

  it("should render dialog when open", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Add a new customer and their contact person.")
    ).toBeInTheDocument();
  });

  it("should not render dialog when closed", () => {
    renderDialog(false);
    expect(screen.queryByText("Add Customer")).not.toBeInTheDocument();
  });

  it("should show customer information section", () => {
    renderDialog();
    expect(screen.getByText("Company Information")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Company name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("City, Country")).toBeInTheDocument();
  });

  it("should show contact person section", () => {
    renderDialog();
    expect(screen.getByText("Contact Person")).toBeInTheDocument();
    expect(
      screen.getByText("Use same name & contact info")
    ).toBeInTheDocument();
  });

  it("should hide user fields when 'use same info' is checked", () => {
    renderDialog();
    expect(
      screen.getByText(
        "Contact person will use the same name, location, phone, and email as the customer."
      )
    ).toBeInTheDocument();
  });

  it("should show user fields when 'use same info' is unchecked", async () => {
    renderDialog();
    const checkbox = screen.getByRole("checkbox");
    await user.click(checkbox);
    expect(screen.getByPlaceholderText("Contact name")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("person@company.com")).toBeInTheDocument();
  });

  it("should submit form with customer and user data", async () => {
    renderDialog();

    await user.type(screen.getByPlaceholderText("Company name"), "Acme AB");
    await user.type(screen.getAllByPlaceholderText("City, Country")[0], "Stockholm");
    await user.type(screen.getAllByPlaceholderText("+46 70 123 4567")[0], "+46701234567");
    await user.type(
      screen.getByPlaceholderText("contact@company.com"),
      "info@acme.se"
    );
    await user.type(
      screen.getByPlaceholderText("e.g. IT, Construction, Retail"),
      "IT"
    );

    await user.click(screen.getByRole("button", { name: /add customer/i }));

    expect(mockOnSubmit).toHaveBeenCalledWith({
      customer: expect.objectContaining({
        name: "Acme AB",
        location: "Stockholm",
        phone: "+46701234567",
        email: "info@acme.se",
        categoryOfWork: "IT",
        status: "not_contacted",
      }),
      user: expect.objectContaining({
        name: "Acme AB",
        location: "Stockholm",
        phone: "+46701234567",
        email: "info@acme.se",
      }),
    });
  });

  it("should display all status options", () => {
    renderDialog();
    const select = screen.getByDisplayValue("Not Contacted");
    expect(select).toBeInTheDocument();

    const options = select.querySelectorAll("option");
    expect(options).toHaveLength(7);
  });

  it("should call onOpenChange when cancel is clicked", async () => {
    renderDialog();
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });
});
