
export type CategoryName = 
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

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  sortOrder?: number;
  active: boolean;
  iconName?: string;
}

export interface Review {
  user: string;
  rating: number;
  comment: string;
  date: string;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string; // Changed to string to hold categoryId
  tagline?: string;
  note?: string;
  reviews?: Review[];
  averageRating?: number;
  imageUrl?: string;
  available: boolean;
  featured?: boolean;
  sortOrder?: number;
}

export interface RestaurantSettings {
  name: string;
  logo?: string;
  contactInfo: {
    phone: string;
    whatsapp: string;
    location: string;
    mapLink: string;
    contactPerson: string;
    paybill: string;
    vendor: string;
  };
  colors: {
    primary: string;
    text: string;
    bg: string;
    bgSecondary: string;
  };
  extraCosts: {
    topping: number;
    otherExtra: number;
  };
  deliveryOptions: Record<string, DeliveryInfo>;
  customizationOptions: {
    sides: string[];
    pizzaToppings: string[];
    breakfastToppings: string[];
    burritoFillings: string[];
  };
}

export interface ItemCustomization {
  sides?: string[];
  toppings?: string[];
  extras?: string[]; // Up to 2 specific extra items (e.g., "Extra Sauce")
  instructions?: string; // General prep instructions
  extraCost: number;
}

export interface CartItem extends MenuItem {
  quantity: number;
  customization?: ItemCustomization;
  instanceId: string; // Unique ID for items with different customizations
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

export interface UserProfile {
  name: string;
  phone: string;
  photo?: string;
}

export interface HistoricalOrder {
  id: string;
  date: string;
  items: CartItem[];
  total: number;
  type: OrderType;
}
