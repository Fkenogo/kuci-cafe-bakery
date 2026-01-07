
export type Category = 
  | "Signature Meals"
  | "Kuci Omelettes"
  | "Kuci Salads"
  | "Kuci Desserts"
  | "Kuci Burgers"
  | "Kuci Soups"
  | "Kuci Sandwiches"
  | "Bites"
  | "Kuci Pasta"
  | "Kuci Sizzling"
  | "Kuci Toast"
  | "Kuci Pizza"
  | "Fresh Juice"
  | "Café Signature Cocktails"
  | "Kuci Wines & Spirits"
  | "Beverages"
  | "Smoothies"
  | "Frappe"
  | "Milk Shake"
  | "Kuci Teas"
  | "Iced Espresso & Coffee"
  | "Kuci Breakfast"
  | "Coffee & Espresso"
  | "Bakery & Pastries";

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: Category;
  tagline?: string;
  note?: string;
}

export interface CartItem extends MenuItem {
  quantity: number;
}

export enum OrderType {
  EAT_IN = "Eat-In",
  PICK_UP = "Pick-Up",
  DELIVERY = "Delivery"
}

export enum DeliveryArea {
  NYAMATA_CENTRAL = "Nyamata Central",
  WITHIN_5KM = "Within 5 km",
  OUTSIDE = "Other / Check with us"
}

export interface DeliveryInfo {
  area: DeliveryArea;
  fee: number;
  estimatedTime: string;
}
