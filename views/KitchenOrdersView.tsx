import React from 'react';
import { AppUserRecord, MenuItem } from '../types';
import { OperationalOrdersBoard } from '../components/staff/OperationalOrdersBoard';

interface KitchenOrdersViewProps {
  isAllowed: boolean;
  currentStaff: AppUserRecord | null;
  menuItems: MenuItem[];
}

export const KitchenOrdersView: React.FC<KitchenOrdersViewProps> = ({ isAllowed, currentStaff, menuItems }) => {
  return (
    <OperationalOrdersBoard
      isAllowed={isAllowed}
      currentStaff={currentStaff}
      menuItems={menuItems}
      scope="kitchen"
      title="Kitchen Queue"
      subtitle="Food preparation work only. Move accepted items through preparing to ready."
    />
  );
};
