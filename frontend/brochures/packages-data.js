/**
 * Travel Agency — Complete Package Catalog 2025–26
 * 18 packages across 5 regions: India, SE Asia, Europe, Maldives, Dubai
 * Usage: <script src="brochures/packages-data.js"></script>
 *        Access via: window.TRAVEL_PACKAGES
 */

window.PACKAGE_REGIONS = {
    domestic: { label: 'India Domestic', flag: '🇮🇳', color: '#8B3A0F' },
    asia:     { label: 'Southeast Asia',  flag: '🌏',  color: '#4a0072' },
    europe:   { label: 'Europe',          flag: '🇪🇺', color: '#003049' },
    maldives: { label: 'Maldives',        flag: '🇲🇻', color: '#023e8a' },
    dubai:    { label: 'Dubai & UAE',     flag: '🇦🇪', color: '#1a1a2e' }
};

window.BADGE_STYLES = {
    gold:   { bg: '#D4AF37', color: '#1a1a1a' },
    rose:   { bg: '#e91e63', color: '#ffffff' },
    blue:   { bg: '#1565c0', color: '#ffffff' },
    teal:   { bg: '#00897b', color: '#ffffff' },
    silver: { bg: '#607d8b', color: '#ffffff' },
    green:  { bg: '#2e7d32', color: '#ffffff' }
};

window.TRAVEL_PACKAGES = [

    // ═══════════════════════════════════════════════
    // INDIA DOMESTIC
    // ═══════════════════════════════════════════════
    {
        id: 'kerala-classic',
        name: 'Kerala Classic',
        subtitle: "God's Own Country",
        region: 'domestic',
        destination: 'Kerala, India',
        flag: '🇮🇳',
        duration: '5N / 6D',
        nights: 5, days: 6,
        cities: ['Cochin', 'Munnar', 'Alleppey', 'Kovalam'],
        priceFrom: 18500,
        priceNote: 'per person (twin sharing)',
        badge: 'Best Seller', badgeType: 'gold',
        tags: ['family', 'couple', 'honeymoon'],
        gradient: ['#1a472a', '#52b788'],
        highlights: [
            'Houseboat stay in Alleppey backwaters',
            'Tea & spice plantation tour in Munnar',
            'Kathakali cultural performance in Cochin',
            'Kovalam beach & Lighthouse sunset'
        ],
        inclusions: ['3★/4★ Hotels', 'Daily Breakfast + 4 Dinners', 'AC Vehicle throughout', 'All Sightseeing', 'Airport Transfers'],
        exclusions: ['Flights', 'GST @ 5%', 'Personal expenses', 'Camera fees'],
        itinerary: [
            { day: 1, title: 'Arrive Cochin',           desc: 'Airport pickup → Fort Kochi heritage walk → Kathakali show → Hotel' },
            { day: 2, title: 'Cochin → Munnar',         desc: 'Drive (4 hrs) → Tea estate visit → Eravikulam National Park' },
            { day: 3, title: 'Munnar Sightseeing',      desc: 'Mattupetty Dam → Echo Point → Kundala Lake → Top Station' },
            { day: 4, title: 'Munnar → Alleppey',       desc: 'Drive → Houseboat check-in → Backwater cruise → Dinner on board' },
            { day: 5, title: 'Alleppey → Kovalam',      desc: 'Morning on houseboat → Drive to Kovalam beach → Seafood dinner' },
            { day: 6, title: 'Kovalam → Depart',        desc: 'Breakfast → Trivandrum sightseeing → Airport drop' }
        ]
    },
    {
        id: 'rajasthan-royal',
        name: 'Rajasthan Royal',
        subtitle: 'Land of Kings & Forts',
        region: 'domestic',
        destination: 'Rajasthan, India',
        flag: '🇮🇳',
        duration: '7N / 8D',
        nights: 7, days: 8,
        cities: ['Jaipur', 'Jodhpur', 'Jaisalmer', 'Udaipur'],
        priceFrom: 22000,
        priceNote: 'per person (twin sharing)',
        badge: 'Most Popular', badgeType: 'gold',
        tags: ['family', 'heritage', 'couple'],
        gradient: ['#7B2D00', '#E76F51'],
        highlights: [
            'Amber Fort & Hawa Mahal in Jaipur',
            'Mehrangarh Fort — view over the Blue City',
            'Desert camel safari & overnight camp, Jaisalmer',
            'Lake Pichola sunset boat ride in Udaipur'
        ],
        inclusions: ['3★/4★ Hotels (incl. Heritage property)', 'Daily Breakfast + 5 Dinners', 'AC Vehicle with driver', 'All Entry Fees', 'Camel Safari in Jaisalmer'],
        exclusions: ['Flights', 'GST @ 5%', 'Tips & porterage', 'Personal expenses'],
        itinerary: [
            { day: 1, title: 'Arrive Jaipur',           desc: 'Airport pickup → Hotel → Chokhi Dhani evening dinner' },
            { day: 2, title: 'Jaipur Sightseeing',      desc: 'Amber Fort → Hawa Mahal → City Palace → Jantar Mantar' },
            { day: 3, title: 'Jaipur → Jodhpur',        desc: 'Drive (6 hrs) → Mehrangarh Fort → Clock Tower market' },
            { day: 4, title: 'Jodhpur → Jaisalmer',     desc: 'Drive (5 hrs) → Sam Sand Dunes → Camel safari → Desert cultural dinner' },
            { day: 5, title: 'Jaisalmer',               desc: 'Jaisalmer Fort → Patwon Ki Haveli → Gadisar Lake' },
            { day: 6, title: 'Jaisalmer → Udaipur',     desc: 'Drive (7 hrs) → Lake Pichola boat ride → City Palace' },
            { day: 7, title: 'Udaipur',                 desc: 'Jagdish Temple → Saheliyon Ki Bari → Lal Ghat sunset' },
            { day: 8, title: 'Depart Udaipur',          desc: 'Breakfast → Udaipur Airport drop — Royal farewell' }
        ]
    },
    {
        id: 'kashmir-paradise',
        name: 'Kashmir Paradise',
        subtitle: 'Heaven on Earth',
        region: 'domestic',
        destination: 'Kashmir, India',
        flag: '🇮🇳',
        duration: '5N / 6D',
        nights: 5, days: 6,
        cities: ['Srinagar', 'Gulmarg', 'Pahalgam', 'Sonmarg'],
        priceFrom: 24000,
        priceNote: 'per person (twin sharing)',
        badge: 'Hot Pick', badgeType: 'blue',
        tags: ['honeymoon', 'adventure', 'nature'],
        gradient: ['#0077b6', '#00b4d8'],
        highlights: [
            'Dal Lake shikara ride & charming houseboat stay',
            'Gondola ride in Gulmarg (2nd highest in the world)',
            'Betab Valley & Chandanwari meadows in Pahalgam',
            'Thajiwas Glacier trek & snow sports in Sonmarg'
        ],
        inclusions: ['1N Houseboat + 3★/4★ Hotels', 'All Meals (Breakfast + Dinner)', 'AC Innova / Traveller', 'Sightseeing & Entry Fees', 'Shikara ride'],
        exclusions: ['Flights to/from Srinagar', 'GST @ 5%', 'Gondola tickets', 'Porter/pony charges'],
        itinerary: [
            { day: 1, title: 'Arrive Srinagar',         desc: 'Airport pickup → Mughal Garden → Shikara ride → Houseboat check-in' },
            { day: 2, title: 'Srinagar → Gulmarg',      desc: 'Drive to Gulmarg (50 km) → Gondola Phase 1 & 2 → Snow activities' },
            { day: 3, title: 'Gulmarg → Pahalgam',      desc: 'Drive (3.5 hrs) → Betab Valley → Aru Valley → Hotel' },
            { day: 4, title: 'Pahalgam',                desc: 'Chandanwari day trip → Pony rides → Lidder River picnic' },
            { day: 5, title: 'Pahalgam → Sonmarg',      desc: 'Sonmarg day trip → Thajiwas Glacier → Return to Srinagar' },
            { day: 6, title: 'Depart Srinagar',         desc: 'Breakfast → Local market → Airport drop' }
        ]
    },
    {
        id: 'goa-beach-escape',
        name: 'Goa Beach Escape',
        subtitle: 'Sun, Sand & Serenity',
        region: 'domestic',
        destination: 'Goa, India',
        flag: '🇮🇳',
        duration: '3N / 4D',
        nights: 3, days: 4,
        cities: ['North Goa', 'South Goa'],
        priceFrom: 12500,
        priceNote: 'per person (twin sharing)',
        badge: 'Weekend Getaway', badgeType: 'teal',
        tags: ['family', 'couple', 'adventure'],
        gradient: ['#0a9396', '#94d2bd'],
        highlights: [
            'North Goa — Baga, Calangute, Anjuna beaches',
            'Water sports: parasailing, jet ski, banana boat',
            'Old Goa heritage — Basilica of Bom Jesus',
            'South Goa — Palolem beach sunset'
        ],
        inclusions: ['3★/4★ Beach Resort', 'Daily Breakfast', 'Airport Transfers', 'North + South Goa Day Tour', 'Spice Plantation visit'],
        exclusions: ['Flights', 'GST @ 5%', 'Water sports fees', 'Meals beyond breakfast'],
        itinerary: [
            { day: 1, title: 'Arrive Goa',              desc: 'Airport pickup → Hotel → Baga/Calangute beach evening' },
            { day: 2, title: 'North Goa Tour',           desc: 'Anjuna → Vagator → Chapora Fort → Water sports → Night market' },
            { day: 3, title: 'Heritage + South Goa',    desc: 'Old Goa churches → Panjim → Palolem Beach sunset' },
            { day: 4, title: 'Depart Goa',              desc: 'Breakfast → Airport drop' }
        ]
    },
    {
        id: 'himachal-holiday',
        name: 'Himachal Holiday',
        subtitle: 'Mountains, Valleys & Snow',
        region: 'domestic',
        destination: 'Himachal Pradesh, India',
        flag: '🇮🇳',
        duration: '6N / 7D',
        nights: 6, days: 7,
        cities: ['Shimla', 'Kufri', 'Manali', 'Solang Valley'],
        priceFrom: 16000,
        priceNote: 'per person (twin sharing)',
        badge: 'Family Favourite', badgeType: 'green',
        tags: ['family', 'adventure', 'nature'],
        gradient: ['#264653', '#2a9d8f'],
        highlights: [
            'Mall Road & Ridge in colonial Shimla',
            'Rohtang Pass snow point (permit included)',
            'Solang Valley — zip-line, ATV & gorge swing',
            'Hadimba Devi Temple & Old Manali café culture'
        ],
        inclusions: ['3★ Hill-view Hotels', 'Daily Breakfast + 5 Dinners', 'AC Innova end-to-end', 'Rohtang Permit + transfer', 'Solang Valley entry'],
        exclusions: ['Train/flight to Shimla or Chandigarh', 'GST @ 5%', 'Adventure activity fees', 'Laundry'],
        itinerary: [
            { day: 1, title: 'Arrive Shimla',           desc: 'Arrive → Mall Road walk → Ridge viewpoint → Hotel' },
            { day: 2, title: 'Shimla Sightseeing',      desc: 'Kufri → Jakhu Temple → Christ Church → State Museum' },
            { day: 3, title: 'Shimla → Manali',         desc: 'Drive via Kullu Valley (7 hrs) → Optional rafting → Manali hotel' },
            { day: 4, title: 'Rohtang Pass',            desc: 'Early start → Rohtang Pass (3,978m) → Snow play + return' },
            { day: 5, title: 'Solang Valley',           desc: 'Zip-line + Gorge swing + ATV → Hadimba Temple evening' },
            { day: 6, title: 'Manali Leisure',          desc: 'Vashisht hot springs → Old Manali market → Farewell dinner' },
            { day: 7, title: 'Depart Manali',           desc: 'Breakfast → Drive to Chandigarh/Delhi (10–12 hrs)' }
        ]
    },
    {
        id: 'andaman-islands',
        name: 'Andaman Islands',
        subtitle: 'Pristine Beaches & Crystal Waters',
        region: 'domestic',
        destination: 'Andaman & Nicobar, India',
        flag: '🇮🇳',
        duration: '5N / 6D',
        nights: 5, days: 6,
        cities: ['Port Blair', 'Havelock Island', 'Neil Island'],
        priceFrom: 28000,
        priceNote: 'per person (twin sharing)',
        badge: 'Hidden Gem', badgeType: 'blue',
        tags: ['honeymoon', 'adventure', 'nature'],
        gradient: ['#003566', '#0096c7'],
        highlights: [
            "Radhanagar Beach — Asia's #1 rated beach",
            'Snorkelling & scuba at Elephant Beach, Havelock',
            'Cellular Jail — haunting light & sound show',
            'Neil Island — Natural Rock Bridge & coral reefs'
        ],
        inclusions: ['3★/4★ Beach Resorts', 'Daily Breakfast + 4 Dinners', 'All Ferry Tickets (inter-island)', 'All Sightseeing', 'Elephant Beach snorkelling'],
        exclusions: ['Flights to/from Port Blair', 'GST @ 5%', 'Scuba optional (₹3,500/person)', 'Sea plane'],
        itinerary: [
            { day: 1, title: 'Arrive Port Blair',       desc: 'Airport pickup → Corbyn\'s Cove Beach → Cellular Jail light & sound show' },
            { day: 2, title: 'Port Blair → Havelock',   desc: 'Ferry to Havelock → Radhanagar Beach (Beach 7) sunset' },
            { day: 3, title: 'Havelock',                desc: 'Elephant Beach snorkelling → Kalapathar Beach evening' },
            { day: 4, title: 'Havelock → Neil Island',  desc: 'Ferry → Bharatpur Beach → Natural Rock Bridge' },
            { day: 5, title: 'Neil → Port Blair',       desc: 'Morning ferry → Ross Island ruins → Souvenir shopping' },
            { day: 6, title: 'Depart Port Blair',       desc: 'Breakfast → Airport drop' }
        ]
    },

    // ═══════════════════════════════════════════════
    // SOUTHEAST ASIA
    // ═══════════════════════════════════════════════
    {
        id: 'thailand-highlights',
        name: 'Thailand Highlights',
        subtitle: 'Land of Smiles',
        region: 'asia',
        destination: 'Thailand',
        flag: '🇹🇭',
        duration: '5N / 6D',
        nights: 5, days: 6,
        cities: ['Bangkok', 'Pattaya', 'Phuket'],
        priceFrom: 38000,
        priceNote: 'per person (land only, twin sharing)',
        badge: 'Best Seller', badgeType: 'gold',
        tags: ['family', 'couple', 'adventure'],
        gradient: ['#6A0572', '#AB2E8B'],
        highlights: [
            'Grand Palace & Wat Pho temple complex, Bangkok',
            'Coral Island speedboat + snorkelling, Pattaya',
            'Phi Phi Island day tour from Phuket',
            'Alcazar cabaret show — world-class entertainment'
        ],
        inclusions: ['3★/4★ Hotels', 'Daily Breakfast + 3 Dinners', 'All Tours & AC Transfers', 'Coral Island by speedboat', 'Alcazar Show entry'],
        exclusions: ['International Flights', 'Thailand Visa (₹2,500 approx)', 'GST @ 5%', 'Personal expenses'],
        itinerary: [
            { day: 1, title: 'Arrive Bangkok',          desc: 'Airport pickup → Hotel → Khao San Road / Chatuchak market' },
            { day: 2, title: 'Bangkok City Tour',       desc: 'Grand Palace → Wat Pho → Emerald Buddha → Chao Phraya cruise' },
            { day: 3, title: 'Bangkok → Pattaya',       desc: 'Drive (2 hrs) → Coral Island day trip → Nong Nooch Garden → Cabaret show' },
            { day: 4, title: 'Pattaya',                 desc: 'Floating Market → Sanctuary of Truth → Walking Street evening' },
            { day: 5, title: 'Fly to Phuket',           desc: 'Domestic flight → Phi Phi Island tour → Patong Beach sunset' },
            { day: 6, title: 'Depart Phuket',           desc: 'Breakfast → Phuket Airport drop' }
        ]
    },
    {
        id: 'bali-serenity',
        name: 'Bali Serenity',
        subtitle: 'Island of Gods',
        region: 'asia',
        destination: 'Bali, Indonesia',
        flag: '🇮🇩',
        duration: '5N / 6D',
        nights: 5, days: 6,
        cities: ['Kuta', 'Ubud', 'Seminyak', 'Nusa Penida'],
        priceFrom: 35000,
        priceNote: 'per person (land only, twin sharing)',
        badge: 'Honeymoon Fav', badgeType: 'rose',
        tags: ['honeymoon', 'couple', 'nature'],
        gradient: ['#800000', '#FF6B6B'],
        highlights: [
            "Tegallalang rice terraces & Bali swing in Ubud",
            'Tanah Lot cliff temple at sunset',
            "Nusa Penida — Kelingking Beach & Angel's Billabong",
            'Uluwatu Temple + Kecak fire dance at dusk'
        ],
        inclusions: ['4★ Villa/Resort', 'Daily Breakfast', 'Airport Transfers', 'Ubud Day Tour', 'Nusa Penida speedboat tour', 'Tanah Lot sunset tour'],
        exclusions: ['Flights + Visa on Arrival', 'GST @ 5%', 'Meals beyond breakfast', 'Optional activities'],
        itinerary: [
            { day: 1, title: 'Arrive Bali',             desc: 'Airport pickup → Seminyak → Tanah Lot sunset temple' },
            { day: 2, title: 'Ubud Day Tour',           desc: 'Tegallalang rice terrace → Bali swing → Tirta Empul → Monkey Forest' },
            { day: 3, title: 'Nusa Penida Day Trip',    desc: 'Speedboat → Kelingking Beach → Angel\'s Billabong → Crystal Bay' },
            { day: 4, title: 'Uluwatu & South Bali',    desc: 'Uluwatu Temple → Kecak fire dance → Jimbaran seafood beach dinner' },
            { day: 5, title: 'Seminyak Leisure',        desc: 'Spa & massage → Beach clubs → Sunset at Ku De Ta' },
            { day: 6, title: 'Depart Bali',             desc: 'Breakfast → Ngurah Rai Airport drop' }
        ]
    },
    {
        id: 'singapore-malaysia',
        name: 'Singapore + Malaysia',
        subtitle: 'The Ultimate Combo',
        region: 'asia',
        destination: 'Singapore & Malaysia',
        flag: '🇸🇬',
        duration: '6N / 7D',
        nights: 6, days: 7,
        cities: ['Singapore', 'Genting Highlands', 'Kuala Lumpur'],
        priceFrom: 55000,
        priceNote: 'per person (land only, twin sharing)',
        badge: 'Fan Favourite', badgeType: 'blue',
        tags: ['family', 'couple', 'shopping'],
        gradient: ['#0a3d62', '#1e90ff'],
        highlights: [
            'Gardens by the Bay — Supertree light show',
            'Universal Studios Singapore (optional)',
            'Genting Highlands cable car & SkyAvenue',
            'Petronas Twin Towers & KL city tour'
        ],
        inclusions: ['3★/4★ Hotels', 'Daily Breakfast + 2 Dinners', 'AC Coach throughout', 'Gardens by Bay (Flower Dome + Cloud Forest)', 'Genting Cable Car'],
        exclusions: ['Flights', 'Singapore + Malaysia Visa', 'GST @ 5%', 'Universal Studios entry', 'Personal expenses'],
        itinerary: [
            { day: 1, title: 'Arrive Singapore',        desc: 'Airport pickup → Merlion Park → Marina Bay Sands → Supertree Grove show' },
            { day: 2, title: 'Singapore City',          desc: 'Sentosa Island → Universal Studios / Cable Car → Clarke Quay dinner' },
            { day: 3, title: 'Gardens & Shopping',      desc: 'Gardens by the Bay → Orchard Road → Night Safari (optional)' },
            { day: 4, title: 'Singapore → Genting',     desc: 'Coach (5 hrs) → Genting Highlands → Sky Casino' },
            { day: 5, title: 'Genting → Kuala Lumpur',  desc: 'Batu Caves → KL check-in → Petronas Towers viewing deck' },
            { day: 6, title: 'KL City Tour',            desc: 'KL Tower → Aquaria KLCC → Central Market → Bukit Bintang' },
            { day: 7, title: 'Depart KL',               desc: 'Breakfast → KLIA Airport drop' }
        ]
    },
    {
        id: 'vietnam-explorer',
        name: 'Vietnam Explorer',
        subtitle: 'Between Heaven & Earth',
        region: 'asia',
        destination: 'Vietnam',
        flag: '🇻🇳',
        duration: '6N / 7D',
        nights: 6, days: 7,
        cities: ['Hanoi', 'Halong Bay', 'Da Nang', 'Hoi An'],
        priceFrom: 42000,
        priceNote: 'per person (land only, twin sharing)',
        badge: 'Trending', badgeType: 'teal',
        tags: ['couple', 'heritage', 'adventure'],
        gradient: ['#d62828', '#f77f00'],
        highlights: [
            'Halong Bay overnight cruise (2D/1N) with kayaking',
            'Limestone cave exploration by kayak',
            'Hoi An Ancient Town by lantern light',
            'Marble Mountains & Dragon Bridge in Da Nang'
        ],
        inclusions: ['3★/4★ Hotels + 1N Halong Bay Cruise', 'All Meals on cruise | Breakfast elsewhere', 'Domestic flight Hanoi→Da Nang', 'Halong Bay cave tour + kayaking', 'Hoi An lantern boat ride'],
        exclusions: ['International Flights', 'Vietnam e-Visa (₹2,000 approx)', 'GST @ 5%', 'Tips'],
        itinerary: [
            { day: 1, title: 'Arrive Hanoi',            desc: 'Airport pickup → Hoan Kiem Lake → Old Quarter street food tour' },
            { day: 2, title: 'Hanoi → Halong Bay',      desc: 'Drive (3.5 hrs) → Board cruise → Kayaking through caves → Seafood dinner → Overnight' },
            { day: 3, title: 'Halong → Da Nang',        desc: 'Sunrise on bay → Return to Hanoi → Fly to Da Nang → Check-in' },
            { day: 4, title: 'Da Nang City',            desc: 'Marble Mountains → Lady Buddha → Dragon Bridge evening → My Khe Beach' },
            { day: 5, title: 'Hoi An',                  desc: 'Ancient Town walk → Tailor Street → Lantern boat ride at night' },
            { day: 6, title: 'Hoi An Leisure',          desc: 'Coconut village basket boat → Countryside cycling → Cooking class' },
            { day: 7, title: 'Depart Da Nang',          desc: 'Return Da Nang airport → Depart' }
        ]
    },

    // ═══════════════════════════════════════════════
    // EUROPE
    // ═══════════════════════════════════════════════
    {
        id: 'europe-best-of',
        name: 'Best of Europe',
        subtitle: 'Paris · Switzerland · Amsterdam · Prague',
        region: 'europe',
        destination: 'Multi-Country Europe',
        flag: '🇪🇺',
        duration: '10N / 11D',
        nights: 10, days: 11,
        cities: ['Paris', 'Interlaken', 'Lucerne', 'Amsterdam', 'Prague'],
        priceFrom: 135000,
        priceNote: 'per person (land + Europamundo coach, twin sharing)',
        badge: 'Top Package', badgeType: 'gold',
        tags: ['family', 'couple', 'heritage'],
        gradient: ['#003049', '#0077b6'],
        highlights: [
            'Eiffel Tower (Level 2) + Seine River dinner cruise',
            "Jungfraujoch — Top of Europe (3,454m), Switzerland",
            "Anne Frank House & Amsterdam canal boat cruise",
            'Charles Bridge & Prague Castle moonlit walk'
        ],
        inclusions: ['3★/4★ Hotels (twin/triple)', 'Daily Breakfast + 5 Indian Dinners', 'Europamundo coach with English guide', 'Eiffel Tower Level 2', 'Jungfrau rail ticket', 'Rhine Falls visit'],
        exclusions: ['International Flights', 'Schengen Visa (₹10,000–15,000)', 'GST @ 5%', 'Travel Insurance', 'City tax at hotels'],
        itinerary: [
            { day: 1, title: 'Arrive Paris',            desc: 'Airport pickup → Hotel → Eiffel Tower evening → Seine dinner cruise' },
            { day: 2, title: 'Paris',                   desc: 'Louvre (outside) → Champs-Élysées → Arc de Triomphe → Montmartre' },
            { day: 3, title: 'Paris → Interlaken',      desc: 'Coach (7 hrs) → Arrive Interlaken → Swiss dinner' },
            { day: 4, title: 'Jungfraujoch',            desc: 'Train to Top of Europe → Snow activities → Sphinx Observatory' },
            { day: 5, title: 'Lucerne',                 desc: 'Lion Monument → Chapel Bridge → Lake Lucerne boat → Rhine Falls' },
            { day: 6, title: 'Lucerne → Amsterdam',     desc: 'Coach (6 hrs) → Canal walk → Rijksmuseum area' },
            { day: 7, title: 'Amsterdam',               desc: 'Anne Frank House → Canal boat → Volendam village → Diamond factory' },
            { day: 8, title: 'Amsterdam → Prague',      desc: 'Drive (10 hrs with stop) → Enter Czech Republic → Arrive evening' },
            { day: 9, title: 'Prague',                  desc: 'Prague Castle → Charles Bridge → Old Town Square → Astronomical Clock' },
            { day: 10, title: 'Prague Leisure',         desc: 'Wenceslas Square → Shopping → Czech beer experience → Farewell dinner' },
            { day: 11, title: 'Depart Prague',          desc: 'Airport transfer → Fly home' }
        ]
    },
    {
        id: 'switzerland-dream',
        name: 'Switzerland Dream',
        subtitle: 'Alpine Paradise',
        region: 'europe',
        destination: 'Switzerland',
        flag: '🇨🇭',
        duration: '6N / 7D',
        nights: 6, days: 7,
        cities: ['Zurich', 'Interlaken', 'Grindelwald', 'Lucerne', 'Geneva'],
        priceFrom: 155000,
        priceNote: 'per person (land only, twin sharing)',
        badge: 'Luxury Pick', badgeType: 'silver',
        tags: ['honeymoon', 'luxury', 'nature'],
        gradient: ['#1d3461', '#2176ff'],
        highlights: [
            'Jungfraujoch — Top of Europe (3,454m)',
            'Glacier 3000 — gondola & snow activities',
            'Grindelwald First cliff walk & zip-line',
            'Lake Geneva & Lavaux UNESCO vineyards'
        ],
        inclusions: ['4★/5★ Swiss Hotels', 'Daily Breakfast + 4 Dinners', 'Swiss Travel Pass (trains + boats + cable cars)', 'Jungfrau rail ticket', 'Glacier 3000 gondola'],
        exclusions: ['International Flights', 'Schengen Visa', 'GST @ 5%', 'City tax (€2–5/night)', 'Lunch'],
        itinerary: [
            { day: 1, title: 'Arrive Zurich',           desc: 'Airport → Hotel → Lake Zurich stroll → Old Town dinner' },
            { day: 2, title: 'Zurich → Interlaken',     desc: 'Train (2 hrs) → Harder Kulm viewpoint → Brienz Lake boat ride' },
            { day: 3, title: 'Jungfraujoch',            desc: 'Full day: train to Jungfraujoch → Sphinx Observatory → Snow plateau' },
            { day: 4, title: 'Grindelwald',             desc: 'First gondola → Cliff Walk → Bachalpsee Lake hike → Village evening' },
            { day: 5, title: 'Geneva',                  desc: 'Drive to Geneva → Jet d\'Eau → Palais des Nations → Lavaux vineyard' },
            { day: 6, title: 'Glacier 3000',            desc: 'Cable car to Glacier 3000 → Peak Walk bridge → Snow fun → Evening Lausanne' },
            { day: 7, title: 'Depart Geneva',           desc: 'Breakfast → Geneva International Airport' }
        ]
    },
    {
        id: 'italy-splendour',
        name: 'Italy Splendour',
        subtitle: 'Art, History & La Dolce Vita',
        region: 'europe',
        destination: 'Italy',
        flag: '🇮🇹',
        duration: '7N / 8D',
        nights: 7, days: 8,
        cities: ['Rome', 'Florence', 'Venice', 'Amalfi Coast'],
        priceFrom: 145000,
        priceNote: 'per person (land only, twin sharing)',
        badge: 'Cultural Gem', badgeType: 'blue',
        tags: ['honeymoon', 'heritage', 'family'],
        gradient: ['#6d2b2b', '#c0392b'],
        highlights: [
            'Colosseum & Roman Forum VIP skip-the-line entry',
            'Vatican Museums & Sistine Chapel, Rome',
            'Grand Canal gondola ride through Venice',
            'Amalfi Coast scenic drive & Positano village'
        ],
        inclusions: ['4★ Hotels (central Rome/Florence/Venice)', 'Daily Breakfast + 5 Dinners', 'Private AC van throughout', 'Colosseum skip-the-line tickets', 'Vatican Museums entry', 'Venice water taxi'],
        exclusions: ['International Flights', 'Schengen Visa', 'GST @ 5%', 'Venice gondola (optional €80/gondola)', 'Lunch'],
        itinerary: [
            { day: 1, title: 'Arrive Rome',             desc: 'Airport pickup → Hotel → Trevi Fountain → Piazza Navona → Pasta dinner' },
            { day: 2, title: 'Rome Ancient',            desc: 'Colosseum → Roman Forum → Palatine Hill → Circus Maximus' },
            { day: 3, title: 'Vatican & Rome',          desc: 'Vatican Museums → Sistine Chapel → St. Peter\'s Basilica → Spanish Steps' },
            { day: 4, title: 'Rome → Florence',         desc: 'Train (1.5 hrs) → Uffizi Gallery → David replica → Ponte Vecchio' },
            { day: 5, title: 'Florence',                desc: 'Piazzale Michelangelo sunrise → Duomo Cathedral → Leather shopping' },
            { day: 6, title: 'Florence → Venice',       desc: 'Train to Venice (2 hrs) → Water taxi → St. Mark\'s Basilica → Gondola ride' },
            { day: 7, title: 'Venice → Amalfi Coast',   desc: 'Drive (7 hrs) → Positano evening → Seafood dinner' },
            { day: 8, title: 'Depart Naples',           desc: 'Breakfast → Naples Airport → Fly home' }
        ]
    },

    // ═══════════════════════════════════════════════
    // MALDIVES
    // ═══════════════════════════════════════════════
    {
        id: 'maldives-honeymoon',
        name: 'Maldives Honeymoon',
        subtitle: 'Overwater Paradise for Two',
        region: 'maldives',
        destination: 'Maldives',
        flag: '🇲🇻',
        duration: '4N / 5D',
        nights: 4, days: 5,
        cities: ['Malé', 'Resort Island'],
        priceFrom: 85000,
        priceNote: 'per couple (all inclusive)',
        badge: '#1 Honeymoon', badgeType: 'rose',
        tags: ['honeymoon', 'luxury', 'couple'],
        gradient: ['#023e8a', '#00b4d8'],
        highlights: [
            'Overwater bungalow with glass floor & private plunge pool',
            'Snorkelling with manta rays & colourful reef fish',
            'Private beach sunset candlelight dinner for two',
            'Seaplane transfer — breathtaking aerial island views'
        ],
        inclusions: ['4N Overwater Villa (All Inclusive)', 'Seaplane or speedboat transfer both ways', 'All Meals + Premium drinks', 'Snorkelling equipment', 'Sunset dhoni cruise', 'Couples spa 60-min session'],
        exclusions: ['International Flights to Malé', 'GST @ 5%', 'Scuba diving (₹5,000–8,000/dive)', 'Excursions beyond inclusions'],
        itinerary: [
            { day: 1, title: 'Arrive Malé → Resort',    desc: 'Seaplane transfer → Welcome garland → Overwater villa → Beach sunset' },
            { day: 2, title: 'Snorkelling & Spa',       desc: 'Guided reef snorkelling → Manta ray point → Couples spa afternoon' },
            { day: 3, title: 'Island Excursion',        desc: 'Local island visit → Dolphin cruise sunset → Private beach dinner' },
            { day: 4, title: 'Water Sports & Leisure',  desc: 'Kayaking → Jet ski (optional) → Glass-bottom boat → Farewell dinner' },
            { day: 5, title: 'Depart Resort',           desc: 'Breakfast → Seaplane transfer to Malé → International departure' }
        ]
    },
    {
        id: 'maldives-luxury',
        name: 'Maldives Luxury',
        subtitle: 'Ultimate Island Escape',
        region: 'maldives',
        destination: 'Maldives',
        flag: '🇲🇻',
        duration: '6N / 7D',
        nights: 6, days: 7,
        cities: ['Malé', '5★ Resort Island'],
        priceFrom: 180000,
        priceNote: 'per couple (all inclusive)',
        badge: 'Ultra Luxury', badgeType: 'gold',
        tags: ['honeymoon', 'luxury'],
        gradient: ['#001d3d', '#003566'],
        highlights: [
            '5★ resort — private pool villa, dedicated butler service',
            'Whale shark snorkelling excursion (seasonal)',
            'Iconic underwater restaurant dinner for two',
            'Full-day private yacht charter with sandbank picnic'
        ],
        inclusions: ['6N 5★ Water Villa (Full Board)', 'Seaplane transfers both ways', 'All Meals + Mini-bar', 'Daily snorkelling tour', 'Underwater restaurant — 1 dinner', 'Couples spa 90-min', 'Sunset fishing trip'],
        exclusions: ['International Flights to Malé', 'GST @ 5%', 'Alcohol beyond mini-bar', 'Diving courses'],
        itinerary: [
            { day: 1, title: 'Arrive → Resort',         desc: 'Seaplane arrival → Butler welcome → 5★ villa tour → Sunset cocktails' },
            { day: 2, title: 'Reef Discovery',          desc: 'House reef snorkelling → Glass kayak → Underwater observatory' },
            { day: 3, title: 'Whale Shark Excursion',   desc: 'Whale shark snorkelling → Optional submarine → Spa afternoon' },
            { day: 4, title: 'Private Yacht Charter',   desc: 'Full-day yacht → Sandbank picnic → Dolphin watching → Seafood BBQ' },
            { day: 5, title: 'Underwater Dining',       desc: 'Relaxation day → Couples spa → Iconic underwater restaurant dinner' },
            { day: 6, title: 'Final Island Day',        desc: 'Sunrise yoga → Lagoon paddleboarding → Farewell sunset cocktail cruise' },
            { day: 7, title: 'Depart Resort',           desc: 'Breakfast → Seaplane to Malé → International departure' }
        ]
    },

    // ═══════════════════════════════════════════════
    // DUBAI & UAE
    // ═══════════════════════════════════════════════
    {
        id: 'dubai-discovery',
        name: 'Dubai Discovery',
        subtitle: 'City of the Future',
        region: 'dubai',
        destination: 'Dubai & Abu Dhabi, UAE',
        flag: '🇦🇪',
        duration: '4N / 5D',
        nights: 4, days: 5,
        cities: ['Dubai', 'Abu Dhabi'],
        priceFrom: 42000,
        priceNote: 'per person (land only, twin sharing)',
        badge: 'Best Value', badgeType: 'teal',
        tags: ['family', 'shopping', 'couple'],
        gradient: ['#1a1a2e', '#e94560'],
        highlights: [
            'Burj Khalifa At The Top — Levels 124 & 125',
            'Desert Safari — dune bashing, camel ride & BBQ dinner',
            'Dubai Frame & Museum of the Future',
            'Sheikh Zayed Grand Mosque, Abu Dhabi'
        ],
        inclusions: ['4★ Hotel in Dubai (city centre)', 'Daily Breakfast', 'All AC Transfers', 'Burj Khalifa (Levels 124+125)', 'Desert Safari (dinner + entertainment)', 'Dhow Cruise Dinner on Dubai Creek'],
        exclusions: ['International Flights', 'UAE Visa (₹5,500–6,500 approx)', 'GST @ 5%', 'Dubai Mall activities', 'Personal shopping'],
        itinerary: [
            { day: 1, title: 'Arrive Dubai',            desc: 'Airport pickup → Hotel → Dubai Mall → Burj Khalifa At The Top sunset' },
            { day: 2, title: 'Dubai City Tour',         desc: 'Gold Souk → Spice Souk → Abra ride → Dhow Cruise Creek dinner' },
            { day: 3, title: 'Desert Safari',           desc: 'Free morning → Afternoon: Dune bashing → Camel ride → Bedouin camp BBQ + show' },
            { day: 4, title: 'Abu Dhabi Day Trip',      desc: 'Drive (1.5 hrs) → Sheikh Zayed Grand Mosque → Ferrari World → Corniche' },
            { day: 5, title: 'Depart Dubai',            desc: 'Breakfast → JBR Walk → Airport drop' }
        ]
    },
    {
        id: 'dubai-luxury',
        name: 'Dubai Luxury',
        subtitle: 'Glamour, Grandeur & Gold',
        region: 'dubai',
        destination: 'Dubai, Abu Dhabi & RAK, UAE',
        flag: '🇦🇪',
        duration: '5N / 6D',
        nights: 5, days: 6,
        cities: ['Dubai', 'Abu Dhabi', 'Ras Al Khaimah'],
        priceFrom: 65000,
        priceNote: 'per person (land only, twin sharing)',
        badge: 'Premium', badgeType: 'gold',
        tags: ['luxury', 'honeymoon', 'couple'],
        gradient: ['#1a1a2e', '#c9a227'],
        highlights: [
            'Atlantis The Palm & Aquaventure Waterpark (full day)',
            'Burj Khalifa + Dubai Frame + Museum of the Future',
            'Premium Desert Safari — private camp & entertainment',
            "Jais Flight — world's fastest zip-line, Ras Al Khaimah"
        ],
        inclusions: ['5★ Hotel on Palm Jumeirah or Downtown', 'Daily Breakfast + 4 Dinners', 'Private AC transfers throughout', 'Atlantis Aquaventure (full day)', 'Premium Desert Safari', 'Sheikh Zayed Grand Mosque Abu Dhabi'],
        exclusions: ['International Flights', 'UAE Visa', 'GST @ 5%', 'Helicopter tour (optional ₹15,000/person)', 'Alcohol'],
        itinerary: [
            { day: 1, title: 'Arrive Dubai',            desc: 'Private airport pickup → 5★ hotel → Palm Jumeirah drive → Marina dinner' },
            { day: 2, title: 'Atlantis & Palm',         desc: 'Aquaventure Waterpark full day → Lost Chambers Aquarium → Nobu dinner' },
            { day: 3, title: 'Icons of Dubai',          desc: 'Burj Khalifa top → Dubai Frame → Museum of the Future → JBR Beach → Rooftop dinner' },
            { day: 4, title: 'Premium Desert Safari',   desc: 'Dune buggy / quad bike → Private Bedouin camp → BBQ → Belly dance show' },
            { day: 5, title: 'Abu Dhabi + Jais Flight', desc: 'Sheikh Zayed Grand Mosque → RAK Jais zip-line (world\'s fastest) → Sunset dinner' },
            { day: 6, title: 'Depart Dubai',            desc: 'Breakfast → Gold/Perfume Souk → Private airport transfer' }
        ]
    }

];
