import React from 'react';
import { AppUserRecord, MenuItem } from '../types';
import { OperationalOrdersBoard } from '../components/staff/OperationalOrdersBoard';

interface FrontServiceOrdersViewProps {
  isAllowed: boolean;
  currentStaff: AppUserRecord | null;
  menuItems: MenuItem[];
}

export const FrontServiceOrdersView: React.FC<FrontServiceOrdersViewProps> = ({ isAllowed, currentStaff, menuItems }) => {
  return (
    <OperationalOrdersBoard
      isAllowed={isAllowed}
      currentStaff={currentStaff}
      menuItems={menuItems}
      scope="front_service"
      title="Cafe Front Service"
      subtitle="Handle cafe-lane orders from acceptance through completion."
    />
  );
};
