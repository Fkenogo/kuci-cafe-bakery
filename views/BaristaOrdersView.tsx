import React from 'react';
import { AppUserRecord, MenuItem } from '../types';
import { OperationalOrdersBoard } from '../components/staff/OperationalOrdersBoard';

interface BaristaOrdersViewProps {
  isAllowed: boolean;
  currentStaff: AppUserRecord | null;
  menuItems: MenuItem[];
}

export const BaristaOrdersView: React.FC<BaristaOrdersViewProps> = ({ isAllowed, currentStaff, menuItems }) => {
  return (
    <OperationalOrdersBoard
      isAllowed={isAllowed}
      currentStaff={currentStaff}
      menuItems={menuItems}
      scope="barista"
      title="Barista Queue"
      subtitle="Drinks and beverage work only. Move accepted drinks through preparing to ready."
    />
  );
};
