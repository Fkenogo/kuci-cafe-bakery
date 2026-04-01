import React from 'react';
import { AppUserRecord, MenuItem } from '../types';
import { OperationalOrdersBoard } from '../components/staff/OperationalOrdersBoard';

interface BakeryFrontOrdersViewProps {
  isAllowed: boolean;
  currentStaff: AppUserRecord | null;
  menuItems: MenuItem[];
}

export const BakeryFrontOrdersView: React.FC<BakeryFrontOrdersViewProps> = ({ isAllowed, currentStaff, menuItems }) => {
  return (
    <OperationalOrdersBoard
      isAllowed={isAllowed}
      currentStaff={currentStaff}
      menuItems={menuItems}
      scope="bakery_front_service"
      title="Bakery Front"
      subtitle="Accept and hand over bakery-lane orders without dispatching kitchen/barista prep for ready items."
    />
  );
};
