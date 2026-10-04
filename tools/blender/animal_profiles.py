"""What sets each office animal apart. Metres, Z up, the animal faces -Y and its left is +X.

Face numbers are offsets from the head centre: (sideways, forward, up). Forward is a positive number here;
the geometry turns it into -Y.
"""

# One team look: the uniform is shared, the animal and its bow tie are not.
UNIFORM = {'cloth': '#3F6F78', 'cloth_light': '#5E9096', 'pants': '#2F3F4C', 'boots': '#E6DCCB', 'sole': '#1F2A31', 'trim': '#E2C27D'}

PROFILES = {
    'fox': {
        'fur': '#D8702C', 'light': '#F8E9D2', 'dark': '#3B2B27', 'accent': '#E2493A', 'ear_inner': '#F3D9BD',
        'head': (.275, .24, .235), 'muzzle': [((0, .135, -.065), (.1, .115, .085)), ((0, .255, -.088), (.058, .095, .058))],
        'cheeks': ((.155, .1, -.04), (.075, .08, .07)), 'eye': (.105, .045), 'eye_size': (.05, .033, .062),
        'ear': 'tri', 'ear_len': .2, 'ear_r': (.09, .022), 'ear_at': (.15, -.01, .165), 'tail': 'bush', 'ear_color': 'dark',
        'hands': 'dark', 'brow': .0, 'whiskers': False, 'bulk': 1.0, 'nose': (.03, .021, .023), 'nose_color': '#252325',
        'light_face': 'lower',
    },
    'rabbit': {
        'fur': '#EDE5D9', 'light': '#FFF8EF', 'dark': '#C9BBAA', 'accent': '#EE9DBB', 'ear_inner': '#EBB1B0',
        'head': (.262, .235, .235), 'muzzle': [((0, .135, -.07), (.085, .095, .068))],
        'cheeks': ((.105, .11, -.075), (.095, .09, .08)), 'eye': (.105, .04), 'eye_size': (.049, .033, .064),
        'ear': 'long', 'ear_len': .36, 'ear_r': (.07, .045), 'ear_at': (.105, 0, .2), 'tail': 'puff',
        'hands': 'fur', 'brow': .0, 'whiskers': False, 'bulk': .95, 'nose': (.03, .02, .024), 'nose_color': '#D98F95',
        'light_face': 'lower', 'teeth': True,
    },
    'panda': {
        'fur': '#F2EFE7', 'light': '#FFFFFF', 'dark': '#25282B', 'accent': '#3C9AB0', 'ear_inner': '#25282B',
        'head': (.295, .245, .235), 'muzzle': [((0, .15, -.075), (.115, .1, .08))],
        'cheeks': None, 'eye': (.115, .05), 'eye_size': (.048, .03, .06),
        'ear': 'round', 'ear_len': .1, 'ear_r': (.095, .095), 'ear_at': (.185, -.01, .195), 'tail': 'puff',
        'hands': 'dark', 'brow': .0, 'whiskers': False, 'bulk': 1.1, 'nose': (.04, .026, .03), 'nose_color': '#1D2023',
        'light_face': 'none', 'ear_color': 'dark', 'eye_patch': 'dark',
    },
    'cat': {
        'fur': '#8C969C', 'light': '#EFE3D6', 'dark': '#5C666C', 'accent': '#E7B64C', 'ear_inner': '#E9B3AC',
        'head': (.262, .232, .225), 'muzzle': [((0, .15, -.07), (.085, .085, .065))],
        'cheeks': ((.145, .1, -.07), (.085, .08, .075)), 'eye': (.105, .042), 'eye_size': (.05, .033, .064),
        'ear': 'tri', 'ear_len': .2, 'ear_r': (.088, .02), 'ear_at': (.155, 0, .165), 'tail': 'cat',
        'hands': 'light', 'brow': .0, 'whiskers': True, 'bulk': .95, 'nose': (.028, .02, .022), 'nose_color': '#D68E8F',
        'light_face': 'lower', 'stripes': True,
    },
    'dog': {
        'fur': '#C8935A', 'light': '#F6E2C3', 'dark': '#8A5A33', 'accent': '#D6483F', 'ear_inner': '#8A5A33',
        'head': (.272, .24, .232), 'muzzle': [((0, .165, -.08), (.11, .13, .085))],
        'cheeks': ((.14, .1, -.075), (.09, .09, .08)), 'eye': (.108, .05), 'eye_size': (.05, .033, .062),
        'ear': 'floppy', 'ear_len': .25, 'ear_r': (.085, .06), 'ear_at': (.235, -.01, .09), 'tail': 'curl',
        'hands': 'light', 'brow': .0, 'whiskers': False, 'bulk': 1.0, 'nose': (.04, .026, .03), 'nose_color': '#221F20',
        'light_face': 'lower', 'eye_patch': 'dark_one',
    },
    'raccoon': {
        'fur': '#8D938E', 'light': '#ECE6D8', 'dark': '#2D3033', 'accent': '#7C6BE0', 'ear_inner': '#2D3033',
        'head': (.275, .235, .228), 'muzzle': [((0, .15, -.07), (.095, .11, .072))],
        'cheeks': ((.15, .1, -.07), (.095, .09, .08)), 'eye': (.108, .045), 'eye_size': (.05, .032, .062),
        'ear': 'round', 'ear_len': .1, 'ear_r': (.085, .085), 'ear_at': (.165, -.01, .205), 'tail': 'rings',
        'hands': 'dark', 'brow': .0, 'whiskers': True, 'bulk': 1.05, 'nose': (.034, .022, .026), 'nose_color': '#1C1E20',
        'light_face': 'lower', 'eye_patch': 'dark', 'ear_color': 'fur',
    },
    'otter': {
        'fur': '#8A6A47', 'light': '#EAD9BC', 'dark': '#5E4630', 'accent': '#46A8C9', 'ear_inner': '#5E4630',
        'head': (.265, .235, .215), 'muzzle': [((0, .14, -.065), (.115, .105, .075))],
        'cheeks': ((.12, .1, -.07), (.1, .09, .075)), 'eye': (.1, .045), 'eye_size': (.047, .032, .058),
        'ear': 'round', 'ear_len': .08, 'ear_r': (.062, .062), 'ear_at': (.19, 0, .15), 'tail': 'otter',
        'hands': 'dark', 'brow': .0, 'whiskers': True, 'bulk': .98, 'nose': (.04, .025, .028), 'nose_color': '#261E1A',
        'light_face': 'lower', 'ear_color': 'fur',
    },
    'bear': {
        'fur': '#7D553D', 'light': '#DCBE96', 'dark': '#4A3125', 'accent': '#D8663A', 'ear_inner': '#DCBE96',
        'head': (.29, .245, .235), 'muzzle': [((0, .15, -.08), (.12, .11, .085))],
        'cheeks': None, 'eye': (.115, .05), 'eye_size': (.047, .031, .06),
        'ear': 'round', 'ear_len': .1, 'ear_r': (.09, .09), 'ear_at': (.19, -.01, .19), 'tail': 'puff',
        'hands': 'fur', 'brow': .0, 'whiskers': False, 'bulk': 1.12, 'nose': (.042, .028, .032), 'nose_color': '#1F1814',
        'light_face': 'muzzle', 'ear_color': 'fur',
    },
    # A jiangshi, for a session whose process is a zombie. It shares the animals' body; see animal_forms.py.
    'zombie': {
        'fur': '#8DB59B', 'light': '#C4DACB', 'dark': '#3F5648', 'accent': '#B01E23', 'ear_inner': '#8DB59B',
        'head': (.265, .235, .24), 'muzzle': [((0, .12, -.075), (.075, .07, .055))],
        'cheeks': None, 'eye': (.1, .05), 'eye_size': (.04, .03, .05),
        'ear': 'none', 'ear_len': 0, 'ear_r': (0, 0), 'ear_at': (0, 0, 0), 'tail': 'none',
        'hands': 'fur', 'brow': .0, 'whiskers': False, 'bulk': 1.0, 'nose': (.03, .02, .024), 'nose_color': '#2A3A30',
        'light_face': 'none', 'undead': True, 'plain': True, 'robe': .16,
        'uniform': {'cloth': '#2A4A57', 'cloth_light': '#1B3340', 'boots': '#17181D', 'sole': '#0F1014'},
    },
}
