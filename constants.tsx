
import React from 'react';
import { 
  Utensils, 
  Coffee, 
  Soup, 
  Pizza, 
  Cookie, 
  Wine, 
  GlassWater, 
  Sandwich,
  Flame,
  Milk,
  Cherry,
  IceCream,
  Salad,
  Flame as SizzlingIcon,
  CupSoda,
  Beer,
  Cake,
} from 'lucide-react';
import { MenuItem, DeliveryArea, DeliveryInfo } from './types';

export const COLORS = {
  primary: '#f97316', // Warm Orange
  text: '#3e2723',    // Deep Coffee Brown
  bg: '#fffdfa',      // Soft Cream
  bgSecondary: '#f5f5dc', // Light Beige
};

export const EXTRA_COSTS = {
  TOPPING: 1000,
  OTHER_EXTRA: 1000,
};

export const CUSTOMIZATION_OPTIONS = {
  SIDES: [
    "Plain Rice", "Pilau Rice", "Spaghetti", "Boiled Potatoes", 
    "Boiled Bananas", "French Fries", "Lyonaise Potatoes", 
    "Fresh Beans", "Mixed Vegetables", "Greens"
  ],
  PIZZA_TOPPINGS: [
    "Mushroom", "Spinach", "Green Pepper", "Pineapple", "Onions", "Roasted Red Pepper"
  ],
  BREAKFAST_TOPPINGS: [
    "Maple Syrup", "Fresh Fruit", "Whipped Cream", "Honey", "Chocolate Sauce"
  ],
  BURRITO_FILLINGS: [
    "Extra Eggs", "Extra Cheese", "Extra Bacon", "Double Salsa", "Sausage", "Avocado"
  ]
};

export const CONTACT_INFO = {
  phone: '+250795306488',
  whatsapp: '+250783959404',
  email: 'hello@kuci.rw',
  location: 'Nyamata, Bugesera, Rwanda (Opposite AFOS Bugesera)',
  mapLink: "https://www.google.com/maps/place/2%C2%B008'46.6%22S+30%C2%B005'20.0%22E/@-2.146271,30.086319,17z/data=!3m1!4b1!4m4!3m3!8m2!3d-2.146271!4d30.0888939?hl=en&entry=ttu",
  contactPerson: 'Lorraine Ingabire',
  momoPayCode: '6482249',
  momoMerchantName: 'KUCI HOLDINGS'
};

export const DELIVERY_OPTIONS: Record<DeliveryArea, DeliveryInfo> = {
  [DeliveryArea.NYAMATA_CENTRAL]: {
    area: DeliveryArea.NYAMATA_CENTRAL,
    fee: 500,
    estimatedTime: "30-45 mins"
  },
  [DeliveryArea.WITHIN_5KM]: {
    area: DeliveryArea.WITHIN_5KM,
    fee: 1000,
    estimatedTime: "45-60 mins"
  },
  [DeliveryArea.OUTSIDE]: {
    area: DeliveryArea.OUTSIDE,
    fee: 0,
    estimatedTime: "Contact us for timing"
  }
};

export const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "Signature Meals": <Utensils className="w-5 h-5" />,
  "Breakfast": <Coffee className="w-5 h-5" />,
  "Kuci Omelettes": <Utensils className="w-5 h-5" />,
  "Kuci Salads": <Salad className="w-5 h-5" />,
  "Kuci Desserts": <IceCream className="w-5 h-5" />,
  "Kuci Burgers": <Utensils className="w-5 h-5" />,
  "Kuci Soups": <Soup className="w-5 h-5" />,
  "Kuci Sandwiches": <Sandwich className="w-5 h-5" />,
  "Bites": <Utensils className="w-5 h-5" />,
  "Kuci Pasta": <Utensils className="w-5 h-5" />,
  "Kuci Sizzling": <SizzlingIcon className="w-5 h-5" />,
  "Kuci Toast": <Utensils className="w-5 h-5" />,
  "Kuci Pizza": <Pizza className="w-5 h-5" />,
  "Pizza": <Pizza className="w-5 h-5" />,
  "Fresh Juice": <Cherry className="w-5 h-5" />,
  "Café Signature Cocktails": <Wine className="w-5 h-5" />,
  "Kuci Wines & Spirits": <Beer className="w-5 h-5" />,
  "Cocktails & Wines": <Wine className="w-5 h-5" />,
  "Beverages": <GlassWater className="w-5 h-5" />,
  "Smoothies": <Milk className="w-5 h-5" />,
  "Frappe": <Coffee className="w-5 h-5" />,
  "Milk Shake": <Milk className="w-5 h-5" />,
  "Kuci Teas": <Coffee className="w-5 h-5" />,
  "Iced Espresso & Coffee": <Coffee className="w-5 h-5" />,
  "Kuci Breakfast": <Coffee className="w-5 h-5" />,
  "Coffee & Espresso": <Coffee className="w-5 h-5" />,
  "Bakery & Pastries": <Cookie className="w-5 h-5" />,
  "Breads": <Sandwich className="w-5 h-5" />,
  "Cakes": <Cake className="w-5 h-5" />,
  "Pastries & Snacks": <Cookie className="w-5 h-5" />,
  "Breakfast & Light Bites": <Coffee className="w-5 h-5" />,
  kitchen: <Utensils className="w-5 h-5" />,
  bakery: <Cookie className="w-5 h-5" />,
  bar: <Wine className="w-5 h-5" />,
  coffee: <Coffee className="w-5 h-5" />,
};

export const ACCOMPANIMENTS_NOTE = "Served with any 2: Plain Rice, Pilau Rice, Spaghetti, Boiled Potatoes, Boiled Bananas, French Fries, Lyonaise Potatoes, Fresh Beans, Mixed Vegetables, or Greens.";

export const MENU_ITEMS: Array<Partial<MenuItem>> = [
  // SIGNATURE MEALS
  {
    id: 'sig-1',
    name: 'KUCI CLASSIC',
    price: 5000,
    tagline: 'Our house legend on a plate',
    description: 'Fragrant rice dancing with aromatic spices, crowned with your choice of tender beef or succulent chicken. This is where tradition meets comfort in every forkful.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    averageRating: 4.8,
    available: true,
    reviews: [
      { user: "Alice M.", rating: 5, comment: "Best rice I've had in Bugesera! The spices are just right.", date: "12/03/24" },
      { user: "James K.", rating: 4, comment: "Very flavorful, though the beef was a bit spicy for my kids.", date: "05/03/24" }
    ]
  },
  {
    id: 'sig-2',
    name: 'KUCI BEEF STEW',
    price: 5000,
    tagline: 'Slow-cooked soul food',
    description: 'Melt-in-your-mouth beef simmered to perfection with garden-fresh tomatoes, peppers, and onions. A hug in a bowl that tastes like home.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    averageRating: 4.5,
    available: true,
    reviews: [
      { user: "Robert", rating: 5, comment: "Super tender beef, felt like home cooking.", date: "10/03/24" }
    ]
  },
  {
    id: 'cf-1',
    name: 'CAFÉ AU LAIT',
    price: 2500,
    tagline: 'French morning hug',
    description: 'Coffee of the day with steamed milk. Simple elegance in a cup.',
    category: 'Coffee & Espresso',
    averageRating: 4.9,
    available: true,
    reviews: [
      { user: "Lorraine", rating: 5, comment: "Perfect froth and temperature. A must try!", date: "14/03/24" },
      { user: "David", rating: 5, comment: "My daily fuel. Best coffee in Nyamata.", date: "11/03/24" }
    ]
  },
  {
    id: 'sig-3',
    name: 'CHICKEN BIRIYANI',
    price: 6000,
    tagline: 'A fragrant journey to the spice route',
    description: 'Layers of saffron-kissed rice and tender chicken, infused with secrets from ancient kitchens. Each bite reveals a new flavor waiting to be discovered.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    averageRating: 4.7,
    available: true,
    reviews: [
      { user: "Sandra", rating: 5, comment: "The aroma is incredible!", date: "01/03/24" }
    ]
  },
  {
    id: 'sig-4',
    name: 'CHICKEN STEW',
    price: 5000,
    tagline: 'Comfort in every spoonful',
    description: 'Boneless chicken pieces nestled in a rich, peppery embrace. Simple ingredients elevated to extraordinary comfort.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    available: true
  },
  {
    id: 'sig-5',
    name: 'BEEF CURRY',
    price: 5000,
    tagline: 'Bold flavors, tender moments',
    description: 'Succulent beef bathed in our deliciously seasoned curry sauce. A warming dish that builds character with every bite.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    available: true
  },
  {
    id: 'sig-6',
    name: 'CHICKEN CURRY',
    price: 6000,
    tagline: 'Silky, spiced perfection',
    description: 'Skinless chicken breast swimming in golden curry that\'s been kissed by a dozen spices. Comfort food with an adventurous spirit.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    available: true
  },
  {
    id: 'sig-7',
    name: 'CHICKEN LEG',
    price: 6000,
    tagline: 'Fall-off-the-bone goodness',
    description: 'Juicy chicken leg slow-cooked in our signature red sauce until it practically melts on your tongue. Napkins recommended.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    available: true
  },
  {
    id: 'sig-8',
    name: 'CHICKEN COCONUT',
    price: 5500,
    tagline: 'Tropical comfort in a bowl',
    description: 'Tender chicken luxuriating in creamy coconut sauce. Close your eyes and taste the islands.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    available: true
  },
  {
    id: 'sig-9',
    name: 'FISH CURRY',
    price: 6000,
    tagline: 'From the waters to your plate',
    description: 'Fresh fish swimming in aromatic curry that celebrates the catch of the day. Light yet deeply satisfying.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    available: true
  },
  {
    id: 'sig-10',
    name: 'FISH MUSHROOM',
    price: 6000,
    tagline: 'Earth meets ocean',
    description: 'Delicate fish paired with earthy mushrooms in a velvety sauce. A sophisticated dance of flavors.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    available: true
  },
  {
    id: 'sig-11',
    name: 'MINCED MEAT CHIPS',
    price: 4500,
    tagline: 'Your favorite comfort duo, reunited',
    description: 'Crispy golden chips topped with savory seasoned minced meat. Sometimes the best combinations are the simplest.',
    category: 'Signature Meals',
    available: true
  },
  {
    id: 'sig-12',
    name: 'VEGETARIAN PLATTER',
    price: 4000,
    tagline: 'Garden variety excellence',
    description: 'A colorful celebration of vegetables prepared with the same care we give our signature dishes. Proof that plants can be the star of the show.',
    category: 'Signature Meals',
    available: true
  },
  {
    id: 'sig-13',
    name: 'VEGETABLE CURRY',
    price: 4500,
    tagline: 'Colors, textures, and stories',
    description: 'Fresh lettuce, ripe tomatoes, crisp onions, and parmesan in a balsamic cucumber embrace. Every vegetable singing in harmony.',
    category: 'Signature Meals',
    available: true
  },
  {
    id: 'sig-14',
    name: 'STEAK',
    price: 7000,
    tagline: 'Seared to your perfection',
    description: 'A masterpiece of meat, cooked exactly how you dream it. Bold, juicy, unforgettable.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    available: true
  },
  {
    id: 'sig-15',
    name: 'BEEF STROGANOFF',
    price: 5500,
    tagline: 'Russian elegance meets local passion',
    description: 'Tender beef ribbons in a silky mushroom sauce that whispers sophistication. Classic never goes out of style.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    available: true
  },
  {
    id: 'sig-16',
    name: 'POSHO (A.K.A. UGALI)',
    price: 5000,
    tagline: 'Yes, we didn\'t forget the foundation',
    description: 'The soul of East African cuisine. Smooth, comforting, and perfect for scooping up all those delicious sauces.',
    category: 'Signature Meals',
    note: ACCOMPANIMENTS_NOTE,
    available: true
  },

  // KUCI OMELETTES
  {
    id: 'om-1',
    name: 'SPECIAL OMELETTES',
    price: 4000,
    tagline: 'The chef\'s secret recipe',
    description: 'Fluffy eggs folded around our special blend of ingredients. What makes it special? Come find out.',
    category: 'Kuci Omelettes',
    available: true
  },
  {
    id: 'om-2',
    name: 'SPANISH OMELETTES',
    price: 3000,
    tagline: 'Mediterranean sunshine on your plate',
    description: 'A hearty, golden circle of comfort inspired by Spanish traditions.',
    category: 'Kuci Omelettes',
    available: true
  },
  {
    id: 'om-3',
    name: 'PLAIN OMELETTES',
    price: 1500,
    tagline: 'Simple perfection',
    description: 'Sometimes less is more. Perfectly cooked eggs that let quality speak for itself.',
    category: 'Kuci Omelettes',
    available: true
  },
  {
    id: 'om-4',
    name: 'HAM & CHEESE OMELETTES',
    price: 5000,
    tagline: 'The classic duo that never disappoints',
    description: 'Savory ham and melted cheese wrapped in fluffy eggs. Pure breakfast bliss.',
    category: 'Kuci Omelettes',
    available: true
  },
  {
    id: 'om-5',
    name: 'MUSHROOM OMELETTES',
    price: 3000,
    tagline: 'Earthy elegance',
    description: 'Fresh mushrooms tucked into golden eggs. Sophisticated simplicity.',
    category: 'Kuci Omelettes',
    available: true
  },
  {
    id: 'om-6',
    name: 'CHIPS OMELETTES',
    price: 3000,
    tagline: 'Crispy meets creamy',
    description: 'Who said you can\'t have fries with breakfast? Golden chips meeting fluffy eggs in perfect harmony.',
    category: 'Kuci Omelettes',
    available: true
  },
  {
    id: 'om-7',
    name: 'BOILED EGGS (2PCS)',
    price: 1500,
    tagline: 'Back to basics',
    description: 'Two perfectly boiled eggs, cooked just right. Simple, nutritious, timeless.',
    category: 'Kuci Omelettes',
    available: true
  },
  {
    id: 'om-8',
    name: 'SCRAMBLED EGGS',
    price: 3000,
    tagline: 'Soft clouds of morning gold',
    description: 'Light, fluffy, and cooked to creamy perfection.',
    category: 'Kuci Omelettes',
    available: true
  },
  {
    id: 'om-9',
    name: 'FRIED EGGS',
    price: 2000,
    tagline: 'Crispy edges, runny centers',
    description: 'The way nature intended eggs to be enjoyed.',
    category: 'Kuci Omelettes',
    available: true
  },

  // KUCI SALADS
  {
    id: 'sl-1',
    name: 'TUNA SALAD',
    price: 5000,
    tagline: 'Ocean treasures meet garden greens',
    description: 'Premium tuna resting on a bed of crisp lettuce, juicy tomatoes, sharp onions, and creamy cheese. Light lunch, big satisfaction.',
    category: 'Kuci Salads',
    available: true
  },
  {
    id: 'sl-2',
    name: 'GARDEN SALAD',
    price: 3500,
    tagline: 'Straight from our garden to your bowl',
    description: 'Fresh lettuce, ripe tomatoes, crunchy cucumbers, and cheese drizzled with ranch. Healthy never tasted this good.',
    category: 'Kuci Salads',
    available: true
  },
  {
    id: 'sl-3',
    name: 'GREEN SALAD',
    price: 2000,
    tagline: 'Pure, simple, refreshing',
    description: 'The essence of freshness in every crunchy bite. Sometimes green is all you need.',
    category: 'Kuci Salads',
    available: true
  },
  {
    id: 'sl-4',
    name: 'AVOCADO SALAD',
    price: 3000,
    tagline: 'Creamy green gold',
    description: 'Rich, buttery avocado paired with fresh vegetables. Health food that tastes like indulgence.',
    category: 'Kuci Salads',
    available: true
  },
  {
    id: 'sl-5',
    name: 'CHICKEN SALAD',
    price: 6000,
    tagline: 'Protein-packed perfection',
    description: 'Tender chicken strips crowning a bed of crisp vegetables. A meal that energizes.',
    category: 'Kuci Salads',
    available: true
  },
  {
    id: 'sl-6',
    name: 'CHEF SALAD',
    price: 6000,
    tagline: 'Everything but the kitchen sink',
    description: 'Our chef\'s generous creation loaded with premium ingredients. No two bites taste the same. Dressed with our signature vinaigrette.',
    category: 'Kuci Salads',
    available: true
  },

  // KUCI DESSERTS
  {
    id: 'ds-1',
    name: 'FRUIT SALAD',
    price: 2500,
    tagline: 'Nature\'s candy bowl',
    description: 'A rainbow of fresh seasonal fruits cut at peak ripeness. Sweet, juicy, guilt-free pleasure.',
    category: 'Kuci Desserts',
    available: true
  },
  {
    id: 'ds-2',
    name: 'FRUIT PLATTER',
    price: 4000,
    tagline: 'An edible work of art',
    description: 'Beautifully arranged fresh fruits that taste as good as they look. Share or keep it all to yourself—we won\'t judge.',
    category: 'Kuci Desserts',
    available: true
  },
  {
    id: 'ds-3',
    name: 'PANCAKES (3PCS)',
    price: 1500,
    tagline: 'Fluffy clouds with syrup',
    description: 'Golden, light, and begging to be drowned in maple syrup. Breakfast or dessert? Why choose?',
    category: 'Kuci Desserts',
    available: true
  },
  {
    id: 'ds-4',
    name: 'BANANA CAKE SLICE',
    price: 500,
    tagline: 'Grandma\'s secret recipe',
    description: 'Moist, sweet, and packed with banana flavor. One slice is never enough.',
    category: 'Kuci Desserts',
    available: true
  },

  // KUCI BURGERS
  {
    id: 'bg-1',
    name: 'CLASSIC BURGER',
    price: 4000,
    tagline: 'The original. The legend.',
    description: 'Juicy beef patty, crisp lettuce, ripe tomato, and sharp onion in a soft bun. Everything a burger should be.',
    category: 'Kuci Burgers',
    available: true
  },
  {
    id: 'bg-2',
    name: 'CHEESE BEEF BURGER',
    price: 5000,
    tagline: 'Classic meets creamy',
    description: 'Everything you love about our classic, now with melted cheese cascading over the patty. Messy in the best way.',
    category: 'Kuci Burgers',
    available: true
  },
  {
    id: 'bg-3',
    name: 'VEGGIE BURGER',
    price: 4500,
    tagline: 'Plants can be powerful',
    description: 'A satisfying patty made from garden goodness, topped with fresh vegetables. Meat-free, flavor-full.',
    category: 'Kuci Burgers',
    available: true
  },
  {
    id: 'bg-4',
    name: 'CHICKEN BURGER',
    price: 5000,
    tagline: 'For those who prefer wings over hooves',
    description: 'Tender chicken breast, fresh vegetables, and our special sauce. Lighter but no less delicious.',
    category: 'Kuci Burgers',
    available: true
  },
  {
    id: 'bg-5',
    name: 'DOUBLE-DECKER BURGER',
    price: 7000,
    tagline: 'Go big or go home',
    description: 'Two beef patties, double cheese, and all the fixings stacked high. This is not a drill—this is dinner.',
    category: 'Kuci Burgers',
    available: true
  },

  // KUCI SOUPS
  {
    id: 'sp-1',
    name: 'MUSHROOM SOUP',
    price: 4000,
    tagline: 'Earthy, creamy comfort',
    description: 'Velvety smooth soup celebrating the humble mushroom. Perfect for rainy days or whenever you need a hug.',
    category: 'Kuci Soups',
    available: true
  },
  {
    id: 'sp-2',
    name: 'FISH BROTH',
    price: 4000,
    tagline: 'Light, clear, restorative',
    description: 'A delicate broth that captures the essence of the sea. Good for the body, great for the soul.',
    category: 'Kuci Soups',
    available: true
  },
  {
    id: 'sp-3',
    name: 'CHICKEN SOUP',
    price: 4000,
    tagline: 'Grandma was right',
    description: 'This really does make everything better. Hearty, wholesome, healing.',
    category: 'Kuci Soups',
    available: true
  },
  {
    id: 'sp-4',
    name: 'VEGETABLE SOUP',
    price: 3000,
    tagline: 'Garden in a bowl',
    description: 'Fresh vegetables simmered into liquid comfort. Colorful, nutritious, surprisingly satisfying.',
    category: 'Kuci Soups',
    available: true
  },
  {
    id: 'sp-5',
    name: 'QUEEN SOUP',
    price: 3000,
    tagline: 'Fit for royalty',
    description: 'A regal blend of flavors in every spoonful. You deserve to eat like royalty.',
    category: 'Kuci Soups',
    available: true
  },
  {
    id: 'sp-6',
    name: 'MINESTRONE SOUP',
    price: 4500,
    tagline: 'Italian countryside in a bowl',
    description: 'Hearty vegetables, pasta, and herbs simmered to Italian perfection. Rustic comfort food at its finest.',
    category: 'Kuci Soups',
    available: true
  },

  // KUCI SANDWICHES
  {
    id: 'sw-1',
    name: 'CHICKEN TRAMEZINNI',
    price: 5000,
    tagline: 'Italian meets casual',
    description: 'Warm chicken cutlet with fresh tomatoes and creamy mayo on easy focaccia bread, all melted together with cheese.',
    category: 'Kuci Sandwiches',
    available: true
  },
  {
    id: 'sw-2',
    name: 'TUNA SANDWICH',
    price: 5000,
    tagline: 'Ocean meets artisan bread',
    description: 'Our house-made tuna salad piled high with crisp vegetables and creamy mayo. The lunchbox upgrade you deserve.',
    category: 'Kuci Sandwiches',
    available: true
  },
  {
    id: 'sw-3',
    name: 'VEGETABLE SANDWICH',
    price: 3500,
    tagline: 'Grilled veggie goodness',
    description: 'Charred vegetables with our secret house sauce on toasted bread. Who says sandwiches need meat?',
    category: 'Kuci Sandwiches',
    available: true
  },
  {
    id: 'sw-4',
    name: 'EGG SANDWICH',
    price: 3500,
    tagline: 'Breakfast\'s greatest gift',
    description: 'Your eggs, your way, on perfectly toasted bread. Simple breakfast perfection.',
    category: 'Kuci Sandwiches',
    available: true
  },
  {
    id: 'sw-5',
    name: 'MUSHROOM SANDWICH',
    price: 4000,
    tagline: 'Home-grown luxury',
    description: 'Our own mushrooms grilled and stacked on toasted bread. Earthy, satisfying, unexpectedly addictive.',
    category: 'Kuci Sandwiches',
    available: true
  },
  {
    id: 'sw-6',
    name: 'HAM-CHEESE SANDWICH',
    price: 5000,
    tagline: 'The timeless duo',
    description: 'Quality ham and melted cheese on toasted bread. Sometimes classic is all you need.',
    category: 'Kuci Sandwiches',
    available: true
  },
  {
    id: 'sw-7',
    name: 'CLUB SANDWICH',
    price: 6000,
    tagline: 'Triple-decker indulgence',
    description: 'Layers upon layers of meats, vegetables, and spreads. You\'ll need both hands and probably extra napkins.',
    category: 'Kuci Sandwiches',
    available: true
  },

  // BITES
  {
    id: 'bt-1',
    name: 'PLAIN CHIPS',
    price: 2000,
    tagline: 'Golden, crispy, addictive',
    description: 'Hand-cut fries fried to golden perfection. The side that steals the show.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-2',
    name: 'CHIPS AND SALAD',
    price: 3000,
    tagline: 'Crunch meets fresh',
    description: 'Crispy fries paired with garden-fresh salad. Balance in every bite.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-3',
    name: 'PLAIN IMIZUZU',
    price: 3000,
    tagline: 'Local flavor, authentic taste',
    description: 'Traditional fried plantains done right. Sweet, crispy, unmistakably local.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-4',
    name: 'AGASENDA BABOYI BROCHETTE',
    price: 6000,
    tagline: 'Street food elevated',
    description: 'Skewered and grilled to smoky perfection. This is how barbecue should taste.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-5',
    name: 'SAUSAGE BROCHETTE',
    price: 5000,
    tagline: 'Juicy, smoky, satisfying',
    description: 'Premium sausages grilled on skewers. Simple pleasures done exceptionally well.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-6',
    name: 'BEEF BROCHETTE',
    price: 5000,
    tagline: 'Fire-kissed beef',
    description: 'Tender beef chunks charred to perfection. Each skewer tells a story of flame and flavor.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-7',
    name: 'FISH BROCHETTE',
    price: 5000,
    tagline: 'Ocean meets open flame',
    description: 'Fresh fish grilled on skewers with a smoky kiss. Light yet deeply satisfying.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-8',
    name: 'CHICKEN BROCHETTE',
    price: 5000,
    tagline: 'Grilled to juicy perfection',
    description: 'Marinated chicken pieces that come off the skewer tender and flavorful.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-9',
    name: 'VEGETABLE WRAP',
    price: 4000,
    tagline: 'Rainbow rolled up',
    description: 'Grilled vegetables wrapped in a soft tortilla. Healthy fast food that actually tastes good.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-10',
    name: 'FISH WRAP',
    price: 5000,
    tagline: 'Portable ocean feast',
    description: 'Fresh fish wrapped with crisp vegetables. Lunch on the go, elevated.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-11',
    name: 'CHICKEN WRAP',
    price: 4000,
    tagline: 'Handheld perfection',
    description: 'Tender chicken and fresh vegetables rolled tight. Eat it on the run or savor every bite.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-12',
    name: 'BEEF WRAP',
    price: 4000,
    tagline: 'Meaty satisfaction in a tortilla',
    description: 'Seasoned beef wrapped with vegetables. All the flavor, none of the fuss.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-13',
    name: 'CHICKEN WING',
    price: 4500,
    tagline: 'Finger-licking mandatory',
    description: 'Crispy on the outside, juicy inside. Napkins and wet wipes highly recommended.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-14',
    name: 'FISH FINGERS',
    price: 5000,
    tagline: 'Crispy ocean bites',
    description: 'Golden-breaded fish pieces that disappear fast. Kids love them, adults pretend they\'re for sharing.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-15',
    name: 'TACOS',
    price: 5000,
    tagline: 'Mexican street food, Kuci style',
    description: 'Your choice of chicken, beef, fish, or veggies in crispy shells. Every bite is a fiesta.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-16',
    name: 'WHOLE CHICKEN',
    price: 20000,
    tagline: 'Feed the whole table',
    description: 'An entire chicken roasted to golden perfection. Bring your appetite and your friends.',
    category: 'Bites',
    available: true
  },
  {
    id: 'bt-17',
    name: 'WHOLE FISH',
    price: 15000,
    tagline: 'Catch of the day, prepared your way',
    description: 'Fresh whole fish grilled or fried. Size matters—pick yours (15k / 20k / 25k).',
    category: 'Bites',
    available: true
  },

  // KUCI PASTA
  {
    id: 'ps-1',
    name: 'VEGETABLE SPAGHETTI',
    price: 4500,
    tagline: 'Garden meets Italy',
    description: 'Al dente spaghetti tossed with seasonal vegetables. Light, fresh, and surprisingly satisfying.',
    category: 'Kuci Pasta',
    available: true
  },
  {
    id: 'ps-2',
    name: 'SPAGHETTI BOLOGNAISE',
    price: 5000,
    tagline: 'The Italian classic',
    description: 'Rich meat sauce clinging to perfectly cooked spaghetti. Comfort food with an Italian accent.',
    category: 'Kuci Pasta',
    available: true
  },
  {
    id: 'ps-3',
    name: 'PENNE CARBONARA',
    price: 9000,
    tagline: 'Creamy Roman luxury',
    description: 'Penne bathed in a silky sauce of eggs, cheese, and cream. Indulgent doesn\'t begin to describe it.',
    category: 'Kuci Pasta',
    available: true
  },
  {
    id: 'ps-4',
    name: 'MEAT LASAGNA',
    price: 7000,
    tagline: 'Layers of love',
    description: 'Pasta sheets, rich meat sauce, and creamy béchamel baked to bubbling perfection. Worth every calorie.',
    category: 'Kuci Pasta',
    available: true
  },
  {
    id: 'ps-5',
    name: 'VEGETABLE LASAGNA',
    price: 7000,
    tagline: 'Vegetarian doesn\'t mean boring',
    description: 'Layers of pasta, roasted vegetables, and cheese baked until golden. Hearty enough for any appetite.',
    category: 'Kuci Pasta',
    available: true
  },
  {
    id: 'ps-6',
    name: 'VEGETABLE TAGLIATELLE',
    price: 5000,
    tagline: 'Ribbons of flavor',
    description: 'Wide pasta ribbons tossed with fresh vegetables. Elegant simplicity.',
    category: 'Kuci Pasta',
    available: true
  },
  {
    id: 'ps-7',
    name: 'CHICKEN TAGLIATELLE',
    price: 6000,
    tagline: 'Protein meets pasta',
    description: 'Tender chicken pieces with wide pasta ribbons. Satisfying and sophisticated.',
    category: 'Kuci Pasta',
    available: true
  },
  {
    id: 'ps-8',
    name: 'BEEF TAGLIATELLE',
    price: 6000,
    tagline: 'Hearty Italian comfort',
    description: 'Rich beef sauce coating silky pasta ribbons. Bold flavors, tender textures.',
    category: 'Kuci Pasta',
    available: true
  },
  {
    id: 'ps-9',
    name: 'FISH TAGLIATELLE',
    price: 6000,
    tagline: 'Surf meets Italian turf',
    description: 'Delicate fish paired with pasta ribbons in a light sauce. Coastal Italian dining, right here.',
    category: 'Kuci Pasta',
    available: true
  },

  // KUCI SIZZLING
  {
    id: 'sz-1',
    name: 'BEEF SIZZLING',
    price: 6000,
    tagline: 'The sound of satisfaction',
    description: 'Tender beef arriving on a smoking hot plate. Theatre for your taste buds.',
    category: 'Kuci Sizzling',
    available: true
  },
  {
    id: 'sz-2',
    name: 'FISH SIZZLING',
    price: 6000,
    tagline: 'Ocean drama on a hot plate',
    description: 'Fresh fish sizzling dramatically as it reaches your table. Performance and flavor in one.',
    category: 'Kuci Sizzling',
    available: true
  },
  {
    id: 'sz-3',
    name: 'CHICKEN SIZZLING',
    price: 6000,
    tagline: 'Juicy and dramatic',
    description: 'Chicken pieces dancing on a hot plate with vegetables. Dinner and a show.',
    category: 'Kuci Sizzling',
    available: true
  },
  {
    id: 'sz-4',
    name: 'VEGETABLE SIZZLING',
    price: 5000,
    tagline: 'Plants can be exciting too',
    description: 'Garden vegetables arriving in a cloud of steam and sizzle. Proof that vegetarian can be thrilling.',
    category: 'Kuci Sizzling',
    available: true
  },

  // KUCI TOAST
  {
    id: 'ts-1',
    name: 'CHEESE TOAST',
    price: 3000,
    tagline: 'Melted perfection',
    description: 'Golden toast with cheese melted to gooey perfection. Simple happiness. Served with French fries.',
    category: 'Kuci Toast',
    available: true
  },
  {
    id: 'ts-2',
    name: 'EGG TOAST',
    price: 3000,
    tagline: 'Protein-packed comfort',
    description: 'Eggs on crispy toast. Breakfast\'s greatest invention. Served with French fries.',
    category: 'Kuci Toast',
    available: true
  },
  {
    id: 'ts-3',
    name: 'HAM & CHEESE TOAST',
    price: 4000,
    tagline: 'The power couple',
    description: 'Ham and cheese melted on golden toast. Better together. Served with French fries.',
    category: 'Kuci Toast',
    available: true
  },
  {
    id: 'ts-4',
    name: 'KUCI TOAST',
    price: 2500,
    tagline: 'Our signature way',
    description: 'Toast done the Kuci way. You\'ll have to try it to understand. Served with French fries.',
    category: 'Kuci Toast',
    available: true
  },
  {
    id: 'ts-5',
    name: 'VEGETABLE TOAST',
    price: 3000,
    tagline: 'Garden on toast',
    description: 'Fresh vegetables on crispy bread. Healthy never tasted this satisfying. Served with French fries.',
    category: 'Kuci Toast',
    available: true
  },
  {
    id: 'ts-6',
    name: 'MUSHROOM TOAST',
    price: 3500,
    tagline: 'Earthy elegance',
    description: 'Sautéed mushrooms on toasted bread. Sophisticated comfort food. Served with French fries.',
    category: 'Kuci Toast',
    available: true
  },

  // KUCI PIZZA
  {
    id: 'pz-1',
    name: 'MARGHERITA PIZZA',
    price: 4000,
    tagline: 'The Italian original',
    description: 'Classic red sauce, aromatic oregano, and melted Gouda. Simple, perfect, timeless.',
    category: 'Kuci Pizza',
    available: true
  },
  {
    id: 'pz-2',
    name: 'VEGETABLE PIZZA',
    price: 5000,
    tagline: 'Garden party on dough',
    description: 'Colorful vegetables and melted cheese on our signature crust. Healthy indulgence.',
    category: 'Kuci Pizza',
    available: true
  },
  {
    id: 'pz-3',
    name: 'HAWAIIAN CHEESE PIZZA',
    price: 6000,
    tagline: 'Sweet meets savory',
    description: 'Ham and pineapple with Gouda cheese. Controversial? Delicious? Absolutely both.',
    category: 'Kuci Pizza',
    available: true
  },
  {
    id: 'pz-4',
    name: 'CLASSIC BEEF SAUSAGE PIZZA',
    price: 8000,
    tagline: 'Meat lovers\' dream',
    description: 'Beef, sausage, peppers, and onions under a blanket of cheese. Maximum flavor in every slice.',
    category: 'Kuci Pizza',
    available: true
  },
  {
    id: 'pz-5',
    name: 'BEEF PIZZA',
    price: 6000,
    tagline: 'Meaty satisfaction',
    description: 'Seasoned minced beef, tomatoes, and onions with melted cheese. Hearty and honest.',
    category: 'Kuci Pizza',
    available: true
  },
  {
    id: 'pz-6',
    name: 'CHICKEN PIZZA',
    price: 6000,
    tagline: 'Poultry perfection',
    description: 'Tender chicken with vegetables and mushrooms under melted cheese. Lighter but no less delicious.',
    category: 'Kuci Pizza',
    available: true
  },
  {
    id: 'pz-7',
    name: '4 SEASONS PIZZA',
    price: 8000,
    tagline: 'Four quarters, infinite possibilities',
    description: 'Ham, mushrooms, beef, and vegetables—each section tells its own story. Can\'t decide? Get them all.',
    category: 'Kuci Pizza',
    available: true
  },
  {
    id: 'pz-8',
    name: 'TUNA PIZZA',
    price: 8000,
    tagline: 'Ocean meets oven',
    description: 'Premium tuna with vegetables and cheese. Unexpected and unforgettable.',
    category: 'Kuci Pizza',
    available: true
  },
  {
    id: 'pz-9',
    name: 'KUCI SPECIAL PIZZA',
    price: 8000,
    tagline: 'We put everything on it',
    description: 'Chicken, minced meat, sausages, ham, and onions. This is not for the faint of appetite.',
    category: 'Kuci Pizza',
    available: true
  },
  {
    id: 'pz-10',
    name: 'MAKE YOUR OWN PIZZA',
    price: 10000,
    tagline: 'Be the chef',
    description: 'CHOOSE YOUR CRUST, CHEESE, SAUCE, AND MEAT. Our kitchen is your canvas. Add more toppings (1,000 RWF each).',
    category: 'Kuci Pizza',
    available: true
  },

  // FRESH JUICE
  {
    id: 'ju-1',
    name: 'COCKTAIL JUICE',
    price: 4000,
    description: 'Fruit orchestra in a glass. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-2',
    name: 'PAPAYA JUICE',
    price: 3000,
    description: 'Tropical sunshine in liquid form. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-3',
    name: 'LEMON JUICE',
    price: 3000,
    description: 'Zesty wake-up call. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-4',
    name: 'MANGO JUICE',
    price: 3000,
    description: 'Sweet summer memories. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-5',
    name: 'ORANGE JUICE',
    price: 6000,
    description: 'Vitamin C explosion. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-6',
    name: 'APPLE JUICE',
    price: 4500,
    description: 'Crisp orchard freshness. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-7',
    name: 'PASSION JUICE',
    price: 3000,
    description: 'Exotic island vibes. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-8',
    name: 'WATERMELON JUICE',
    price: 3000,
    description: 'Hydration never tasted this good. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-9',
    name: 'PINEAPPLE JUICE',
    price: 2000,
    description: 'Tropical tang in every sip. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-10',
    name: 'TREE TOMATO JUICE',
    price: 2500,
    description: 'Local treasure, unique taste. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-11',
    name: 'PINEAPPLE & MINT',
    price: 3000,
    tagline: 'Zesty Herb Duet',
    description: 'Tropical zing with a refreshing herbal finish. Squeezed fresh to order.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-12',
    name: 'PASSION & GINGER',
    price: 3500,
    tagline: 'Spicy Sweet Kick',
    description: 'A spicy-sweet duet that wakes up the senses. Squeezed fresh, served cold.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-13',
    name: 'BEETROOT & APPLE',
    price: 4500,
    tagline: 'The Health Elixir',
    description: 'Earthy sweetness meeting orchard crispness. A vibrant health boost in every sip.',
    category: 'Fresh Juice',
    available: true
  },
  {
    id: 'ju-14',
    name: 'CARROT & ORANGE',
    price: 5000,
    tagline: 'Golden Sunshine',
    description: 'Liquid sunshine in a glass. Sweet, nutritious, and bright. Squeezed fresh.',
    category: 'Fresh Juice',
    available: true
  },

  // COCKTAILS
  {
    id: 'ck-em',
    name: 'ESPRESSO MARTINI',
    price: 10000,
    tagline: 'Barista\'s Masterpiece',
    description: 'Vodka blended with rich coffee liqueur and freshly pulled espresso. Smooth, bold, and energizing with a refined coffee kick.',
    category: 'Café Signature Cocktails',
    available: true
  },
  {
    id: 'ck-1',
    name: 'CARAMEL COFFEE DELIGHT',
    price: 10000,
    description: 'Creamy Baileys, espresso, and caramel syrup come together for a sweet, indulgent coffee cocktail with a silky finish.',
    category: 'Café Signature Cocktails',
    available: true
  },
  {
    id: 'ck-2',
    name: 'MOCHA RUM CHILL',
    price: 10000,
    description: 'Dark rum meets chocolate syrup, milk, and espresso for a mellow, dessert-style cocktail with deep cocoa notes.',
    category: 'Café Signature Cocktails',
    available: true
  },
  {
    id: 'ck-3',
    name: 'VANILLA BEAN BLISS',
    price: 10000,
    description: 'Vodka infused with vanilla syrup, fresh coffee, and cream. Soft, aromatic, and comforting with a subtle sweetness.',
    category: 'Café Signature Cocktails',
    available: true
  },
  {
    id: 'ck-4',
    name: 'IRISH CREAM VELVET',
    price: 10000,
    description: 'Classic Irish cream mixed with coffee and cream over ice. Rich, smooth, and easy to enjoy.',
    category: 'Café Signature Cocktails',
    available: true
  },
  {
    id: 'ck-5',
    name: 'HAZELNUT WHISPER',
    price: 10000,
    description: 'Coffee liqueur paired with hazelnut syrup, milk, and espresso. Nutty, warm, and gently sweet.',
    category: 'Café Signature Cocktails',
    available: true
  },
  {
    id: 'ck-6',
    name: 'CAFÉ MARGARITA',
    price: 10000,
    description: 'A bold twist on the classic. Tequila, triple sec, fresh lime juice, and a light salt rim for a refreshing coffee-bar crossover.',
    category: 'Café Signature Cocktails',
    available: true
  },
  {
    id: 'ck-7',
    name: 'PASSION PARADISE',
    price: 10000,
    description: 'Vodka shaken with passion fruit purée, vanilla syrup, and lime juice. Bright, fruity, and refreshing.',
    category: 'Café Signature Cocktails',
    available: true
  },
  {
    id: 'ck-8',
    name: 'BLUE LAGOON',
    price: 10000,
    description: 'Vodka, blue curaçao, and lemonade. A vibrant, tropical escape in a glass.',
    category: 'Café Signature Cocktails',
    available: true
  },
  {
    id: 'ck-8',
    name: 'PIÑA COLADA',
    price: 10000,
    description: 'White rum blended with coconut cream and pineapple juice. Tropical, smooth, and perfectly balanced.',
    category: 'Café Signature Cocktails',
    available: true
  },

  // KUCI WINES & SPIRITS
  {
    id: 'wn-1',
    name: 'ROSE WINES',
    price: 30000,
    tagline: 'Pink perfection',
    description: 'Available by the Bottle (30,000 RWF) or Glass (3,000 RWF).',
    category: 'Kuci Wines & Spirits',
    available: true
  },
  {
    id: 'wn-2',
    name: 'RED WINES',
    price: 30000,
    tagline: 'Bold and beautiful',
    description: 'Available by the Bottle (30,000 RWF) or Glass (3,000 RWF).',
    category: 'Kuci Wines & Spirits',
    available: true
  },
  {
    id: 'wn-3',
    name: 'WHITE WINES',
    price: 30000,
    tagline: 'Crisp elegance',
    description: 'Available by the Bottle (30,000 RWF) or Glass (3,000 RWF).',
    category: 'Kuci Wines & Spirits',
    available: true
  },
  {
    id: 'wn-4',
    name: 'MERLOT (BOTTLE)',
    price: 30000,
    tagline: 'Smooth sophistication',
    description: 'A classic rich Merlot. Sip, savor, celebrate.',
    category: 'Kuci Wines & Spirits',
    available: true
  },

  // BEVERAGES
  {
    id: 'bv-1',
    name: 'SODA',
    price: 1000,
    description: 'Your favorite sparkling refreshment (300ml).',
    category: 'Beverages',
    available: true
  },
  {
    id: 'bv-2',
    name: 'MINERAL WATER (500ML)',
    price: 1000,
    description: 'Crystal clear and refreshing.',
    category: 'Beverages',
    available: true
  },
  {
    id: 'bv-3',
    name: 'MINERAL WATER (1LTR)',
    price: 1500,
    description: 'Stay hydrated with a full litre.',
    category: 'Beverages',
    available: true
  },
  {
    id: 'bv-4',
    name: 'SPARKLING WATER (500ML)',
    price: 2000,
    tagline: 'Effervescent Pureness',
    description: 'Crisp bubbles to cleanse the palate. Best served chilled.',
    category: 'Beverages',
    available: true
  },
  {
    id: 'bv-5',
    name: 'TONIC WATER',
    price: 1500,
    tagline: 'The Perfect Mixer',
    description: 'The perfect companion or a refreshing solo act. Crisp and bitter-sweet.',
    category: 'Beverages',
    available: true
  },
  {
    id: 'bv-6',
    name: 'GINGER BEER',
    price: 2500,
    tagline: 'Non-Alcoholic Spice',
    description: 'A spicy local favorite with a real kick. Brewed naturally for bold flavor.',
    category: 'Beverages',
    available: true
  },

  // SMOOTHIES
  {
    id: 'sm-1',
    name: 'TANO MANGO BREEZE',
    price: 5000,
    tagline: 'Tropical tornado',
    description: 'Blended happiness with fresh local mangoes.',
    category: 'Smoothies',
    available: true
  },
  {
    id: 'sm-2',
    name: 'THOUSAND HILLS',
    price: 5000,
    tagline: 'Rwanda in a glass',
    description: 'Our signature blend of local fruits.',
    category: 'Smoothies',
    available: true
  },
  {
    id: 'sm-3',
    name: 'VERY BERRY BREEZE',
    price: 5000,
    tagline: 'Berry explosion',
    description: 'A refreshing mix of seasonal berries.',
    category: 'Smoothies',
    available: true
  },
  {
    id: 'sm-4',
    name: 'BANANA SMOOTHIE',
    price: 5000,
    tagline: 'Creamy potassium power',
    description: 'Fresh bananas blended to perfection.',
    category: 'Smoothies',
    available: true
  },
  {
    id: 'sm-5',
    name: 'CREATE YOUR OWN SMOOTHIE',
    price: 5000,
    tagline: 'Blend your dreams',
    description: 'Choose your fruit combo and refresh.',
    category: 'Smoothies',
    available: true
  },
  {
    id: 'sm-6',
    name: 'SULTANA BANANA SMOOTHIE',
    price: 5000,
    tagline: 'Royal fruit treatment',
    description: 'A premium banana blend with a twist.',
    category: 'Smoothies',
    available: true
  },
  {
    id: 'sm-7',
    name: 'GREEN RECHARGE',
    price: 5500,
    tagline: 'Vegan Clean Energy',
    description: 'Spinach, apple, and banana blended with a coconut water base. Clean energy for the soul. (Vegan)',
    category: 'Smoothies',
    available: true
  },
  {
    id: 'sm-8',
    name: 'PEANUT BUTTER POWER',
    price: 6000,
    tagline: 'Creamy Plant Power',
    description: 'Creamy peanut butter, banana, and almond milk base. Rich, nutty, and entirely plant-based. (Vegan)',
    category: 'Smoothies',
    available: true
  },
  {
    id: 'sm-9',
    name: 'COCO-AVO DREAM',
    price: 6000,
    tagline: 'Silky Tropical Treat',
    description: 'Buttery avocado meeting creamy coconut milk and a hint of lime. A silky tropical masterpiece. (Vegan)',
    category: 'Smoothies',
    available: true
  },
  {
    id: 'sm-10',
    name: 'CHIA SEED SURPRISE',
    price: 5500,
    tagline: 'Nutrient Dense Bite',
    description: 'Mixed berries and soaked chia seeds for a textured, nutrient-dense delight.',
    category: 'Smoothies',
    available: true
  },

  // FRAPPE
  {
    id: 'fr-1',
    name: 'CARAMEL FRAPPE',
    price: 3500,
    tagline: 'Sweet, cold, addictive',
    description: 'Iced, blended, caffeinated goodness.',
    category: 'Frappe',
    available: true
  },
  {
    id: 'fr-2',
    name: 'VANILLA FRAPPE',
    price: 4000,
    tagline: 'Classic cool-down',
    description: 'Iced, blended, caffeinated goodness.',
    category: 'Frappe',
    available: true
  },
  {
    id: 'fr-3',
    name: 'MOCHA FRAPPE',
    price: 4000,
    tagline: 'Chocolate meets coffee',
    description: 'Iced, blended, caffeinated goodness.',
    category: 'Frappe',
    available: true
  },

  // MILK SHAKE
  {
    id: 'mk-1',
    name: 'VANILLA SHAKE',
    price: 4500,
    tagline: 'Classic never fails',
    description: 'Thick, creamy, and dreamy.',
    category: 'Milk Shake',
    available: true
  },
  {
    id: 'mk-2',
    name: 'STRAWBERRY SHAKE',
    price: 4500,
    tagline: 'Berry good choice',
    description: 'Thick, creamy, and dreamy.',
    category: 'Milk Shake',
    available: true
  },
  {
    id: 'mk-3',
    name: 'CHOCOLATE SHAKE',
    price: 4500,
    tagline: 'Liquid happiness',
    description: 'Thick, creamy, and dreamy.',
    category: 'Milk Shake',
    available: true
  },
  {
    id: 'mk-4',
    name: 'COFFEE SHAKE',
    price: 4500,
    tagline: 'Caffeinated dessert',
    description: 'Thick, creamy, and dreamy.',
    category: 'Milk Shake',
    available: true
  },
  {
    id: 'mk-5',
    name: 'MANGO SHAKE',
    price: 4500,
    tagline: 'Tropical thickness',
    description: 'Thick, creamy, and dreamy.',
    category: 'Milk Shake',
    available: true
  },
  {
    id: 'mk-6',
    name: 'BANANA SHAKE',
    price: 4500,
    tagline: 'Smooth operator',
    description: 'Thick, creamy, and dreamy.',
    category: 'Milk Shake',
    available: true
  },
  {
    id: 'mk-7',
    name: 'OREO SHAKE',
    price: 5000,
    tagline: 'Cookies in a glass',
    description: 'Thick, creamy, and dreamy.',
    category: 'Milk Shake',
    available: true
  },
  {
    id: 'mk-8',
    name: 'TROPICAL MIX',
    price: 4500,
    tagline: 'Island vacation vibes',
    description: 'Thick, creamy, and dreamy.',
    category: 'Milk Shake',
    available: true
  },
  {
    id: 'mk-9',
    name: 'CARAMEL SHAKE',
    price: 4500,
    tagline: 'Buttery sweetness',
    description: 'Thick, creamy, and dreamy.',
    category: 'Milk Shake',
    available: true
  },

  // KUCI TEAS
  {
    id: 'te-1',
    name: 'AFRICAN TEA',
    price: 2000,
    tagline: 'Home-grown comfort',
    description: 'Brewed with local ginger and quality tea leaves, simmered with fresh milk.',
    category: 'Kuci Teas',
    available: true
  },
  {
    id: 'te-2',
    name: 'GREEN TEA',
    price: 1500,
    tagline: 'Ancient wisdom in a cup',
    description: 'Steeped to perfection.',
    category: 'Kuci Teas',
    available: true
  },
  {
    id: 'te-3',
    name: 'SPICED TEA',
    price: 3000,
    tagline: 'Warmth and wonder',
    description: 'Our signature blend of spices.',
    category: 'Kuci Teas',
    available: true
  },
  {
    id: 'te-4',
    name: 'ICED TEA',
    price: 2000,
    tagline: 'Cool-down classic',
    description: 'Refreshing and clear.',
    category: 'Kuci Teas',
    available: true
  },
  {
    id: 'te-5',
    name: 'BLACK TEA',
    price: 1000,
    tagline: 'Pure, simple, strong',
    description: 'The way tea was meant to be.',
    category: 'Kuci Teas',
    available: true
  },
  {
    id: 'te-6',
    name: 'MINT TEA',
    price: 2000,
    tagline: 'Refreshing clarity',
    description: 'Fresh mint leaves steeped to order.',
    category: 'Kuci Teas',
    available: true
  },
  {
    id: 'te-7',
    name: 'ROSEMARY TEA',
    price: 2000,
    tagline: 'Herbal sophistication',
    description: 'Steeped to perfection.',
    category: 'Kuci Teas',
    available: true
  },

  // ICED ESPRESSO & COFFEE
  {
    id: 'ic-1',
    name: 'ICED MACCHIATO',
    price: 2500,
    description: 'Marked with milk, chilled to perfection.',
    category: 'Iced Espresso & Coffee',
    available: true
  },
  {
    id: 'ic-2',
    name: 'ICED CARAMEL MACCHIATO',
    price: 3000,
    description: 'Sweet meets strong.',
    category: 'Iced Espresso & Coffee',
    available: true
  },
  {
    id: 'ic-3',
    name: 'ICED MOCHA',
    price: 3000,
    description: 'Chocolate coffee cooldown.',
    category: 'Iced Espresso & Coffee',
    available: true
  },
  {
    id: 'ic-4',
    name: 'AFOGATO (ICED)',
    price: 3000,
    description: 'Espresso meets ice cream.',
    category: 'Iced Espresso & Coffee',
    available: true
  },
  {
    id: 'ic-5',
    name: 'ESPRESSO CREAMY',
    price: 3000,
    description: 'Smooth and strong.',
    category: 'Iced Espresso & Coffee',
    available: true
  },
  {
    id: 'ic-6',
    name: 'ICED LATTE',
    price: 2500,
    description: 'Milk and espresso over ice.',
    category: 'Iced Espresso & Coffee',
    available: true
  },
  {
    id: 'ic-7',
    name: 'ICED AMERICANO',
    price: 2500,
    description: 'Pure espresso, ice cold.',
    category: 'Iced Espresso & Coffee',
    available: true
  },
  {
    id: 'ic-8',
    name: 'ICED CARAMEL LATTE',
    price: 3000,
    description: 'Buttery coffee treat.',
    category: 'Iced Espresso & Coffee',
    available: true
  },
  {
    id: 'ic-9',
    name: 'ICED VANILLA LATTE',
    price: 3000,
    description: 'Sweet simplicity, chilled.',
    category: 'Iced Espresso & Coffee',
    available: true
  },

  // KUCI BREAKFAST
  {
    id: 'br-1',
    name: 'LIGHT BREAKFAST',
    price: 3000,
    tagline: 'Gentle morning start',
    description: 'Fluffy scrambled eggs, fresh bread, and your choice of juice or coffee.',
    category: 'Kuci Breakfast',
    available: true
  },
  {
    id: 'br-2',
    name: 'CONTINENTAL BREAKFAST',
    price: 5000,
    tagline: 'European mornings',
    description: 'Spanish or English omelette with fresh seasonal fruits and your choice of tea or black coffee.',
    category: 'Kuci Breakfast',
    available: true
  },
  {
    id: 'br-3',
    name: 'KUCHI BREAKFAST',
    price: 6000,
    tagline: 'The Kuci signature morning',
    description: 'Spanish or English omelette, fresh fruits, crispy chicken wing, vegetable potato cakes, and your choice of tea.',
    category: 'Kuci Breakfast',
    available: true
  },
  {
    id: 'br-4',
    name: 'FULL BREAKFAST',
    price: 8000,
    tagline: 'Wake up to abundance',
    description: 'Beef or chapati, Spanish omelette, fresh fruits, chicken wings or fish fingers, potato cakes, beef strips, vegetables, soup, house juice, and choice of tea or black coffee.',
    category: 'Kuci Breakfast',
    available: true
  },
  {
    id: 'br-5',
    name: 'BOILO (CHICKEN/BEEF)',
    price: 5000,
    tagline: 'Traditional power breakfast',
    description: 'Authentic local preparation. Fuel for champions.',
    category: 'Kuci Breakfast',
    available: true
  },
  {
    id: 'br-6',
    name: 'AGATOGO (CHICKEN/BEEF/FISH)',
    price: 5000,
    tagline: 'Local morning magic',
    description: 'The traditional way to start strong. Rich, hearty, authentic.',
    category: 'Kuci Breakfast',
    available: true
  },
  {
    id: 'br-7',
    name: 'PANCAKES & WAFFLES',
    price: 4500,
    tagline: 'Sweet morning bliss',
    description: 'Your choice of golden pancakes or crispy waffles. A canvas for your favorite sweet toppings.',
    category: 'Kuci Breakfast',
    available: true
  },
  {
    id: 'br-8',
    name: 'BREAKFAST BURRITO',
    price: 5500,
    tagline: 'Hearty handheld energy',
    description: 'A warm tortilla packed with scrambled eggs, melted cheese, and crispy bacon. Served with our house salsa.',
    category: 'Kuci Breakfast',
    available: true
  },

  // COFFEE & ESPRESSO
  {
    id: 'cf-2',
    name: 'ESPRESSO',
    price: 1000,
    tagline: 'Pure coffee essence',
    description: 'Intense, concentrated, no nonsense.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-3',
    name: 'DOUBLE ESPRESSO',
    price: 1500,
    tagline: 'When one shot isn\'t enough',
    description: 'Double the intensity, double the energy.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-4',
    name: 'BLACK COFFEE',
    price: 2000,
    tagline: 'Classic. Strong. Honest.',
    description: 'No frills, just coffee. The way purists drink it.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-5',
    name: 'AFRICAN COFFEE',
    price: 3000,
    tagline: 'Home-grown strength',
    description: 'Local beans, local pride. Taste the terroir.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-6',
    name: 'HOT CHOCOLATE',
    price: 2500,
    tagline: 'Liquid comfort',
    description: 'Rich, creamy chocolate warmth. Childhood in a mug.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-7',
    name: 'ESPRESSO MACCHIATO',
    price: 2000,
    tagline: 'Marked with perfection',
    description: 'Espresso with just a dollop of foam. Balanced intensity.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-8',
    name: 'LATTE',
    price: 2000,
    tagline: 'Smooth operator',
    description: 'Espresso with steamed milk. Creamy coffee harmony.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-9',
    name: 'BREVE',
    price: 2000,
    tagline: 'Chocolate kiss',
    description: 'Espresso with a hint of chocolate. Sweet meets strong.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-10',
    name: 'CAFÉ MOCHA',
    price: 3000,
    tagline: 'Dessert in a cup',
    description: 'Cappuccino with premium chocolate syrup and froth. Coffee and dessert combined.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-11',
    name: 'CAPPUCCINO',
    price: 2000,
    tagline: 'Italian classic',
    description: 'Espresso, steamed milk, and milk froth in perfect thirds.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-12',
    name: 'AMERICANO',
    price: 1500,
    tagline: 'Diluted perfection',
    description: 'Espresso with hot water. Strong but approachable.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-13',
    name: 'AFFOGATO',
    price: 3000,
    tagline: 'Drowned delight',
    description: 'Ice cream drowning in a shot of espresso. Coffee meets dessert in sweet harmony.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-14',
    name: 'FLATWHITE',
    price: 2500,
    tagline: 'Velvety smooth',
    description: 'Espresso with micro foam. Silky sophistication.',
    category: 'Coffee & Espresso',
    available: true
  },
  {
    id: 'cf-15',
    name: 'CORTADO',
    price: 2000,
    tagline: 'Perfect balance',
    description: 'Espresso cut with equal parts warm milk. Neither too strong nor too mild.',
    category: 'Coffee & Espresso',
    available: true
  }
];
