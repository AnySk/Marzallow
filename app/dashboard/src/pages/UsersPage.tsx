import { AlertsBar } from "components/AlertsBar";
import { BulkActionsBar } from "components/BulkActionsBar";
import { Filters } from "components/Filters";
import { Header } from "components/Header";
import { Statistics } from "components/Statistics";
import { Panel } from "components/ui";
import { UsersTable } from "components/UsersTable";
import { FC } from "react";

export const UsersPage: FC = () => (
  <>
    <Header />
    <AlertsBar />
    <Statistics />
    <Panel
      as="section"
      aria-label="Users"
      overflow="hidden"
      bg={{ base: "transparent", md: "surface" }}
      borderWidth={{ base: 0, md: "1px" }}
      mx={{ base: -4, md: 0 }}
    >
      <Filters />
      <UsersTable />
    </Panel>
    <BulkActionsBar />
  </>
);

export default UsersPage;
