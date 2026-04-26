const https = require("https");

// Verified component specs database.
// To add/update: edit this object and commit — Netlify redeploys automatically.
// Keys are matched case-insensitively against component names entered by users.
const corrections = {
  "Parasound zPhono XRM": {
    "Type": "MM/MC phono preamplifier",
    "Gain options": "40 dB / 50 dB / 60 dB (unbalanced); 46 dB / 56 dB / 66 dB (balanced)",
    "MM gain": "40 dB (default)",
    "MC gain": "60 dB (default)",
    "MM input impedance": "47 kΩ",
    "MC input impedance": "50–1050 Ω (adjustable)",
    "Output impedance (unbalanced)": "150 Ω",
    "Output impedance (balanced)": "150 Ω per leg",
    "Frequency Response": "20 Hz–20 kHz, ±0.2 dB",
    "THD": "0.02% at 1 kHz",
    "SNR (MM, 40 dB gain)": ">94 dB IHF A-weighted; >90 dB unweighted",
    "SNR (MM, 50 dB gain)": ">94 dB IHF A-weighted; >90 dB unweighted",
    "SNR (MC, 50 dB gain)": ">92 dB IHF A-weighted; >88 dB unweighted",
    "SNR (MC, 60 dB gain)": ">82 dB IHF A-weighted; >80 dB unweighted",
    "Inter-channel Crosstalk": ">80 dB at 1 kHz",
    "Rumble Filter": "40 Hz high pass, 18 dB/oct",
    "Power": "7 W on; 0 W standby; 115 VAC or 230 VAC 50–60 Hz"
  },
  "Denon DL-301 II": {
    "Type": "MC (Moving Coil)",
    "Output voltage": "0.4 mV",
    "Dynamic compliance": "13 µm/mN",
    "Static compliance": "35 µm/mN",
    "Internal impedance": "33 Ω",
    "Tracking force": "1.2–1.6 g (recommended 1.4 g)",
    "Recommended loading": "≥ 100 Ω",
    "Channel separation": ">28 dB (at 1 kHz)",
    "Net Weight": "6 g"
  },
  "Fluance RT85": {
    "Drive type": "Belt drive",
    "Speeds": "33⅓, 45 RPM",
    "Tonearm effective mass": "27.5 g",
    "Signal-Noise-Ratio (Weighted)": "76 dB",
    "Signal-Noise-Ratio (Unweighted)": "65 dB",
    "Platter": "Acrylic",
    "Tonearm Type": "Static Balanced, S-Type",
    "Supported Cartridge Weight": "5g-7.5 g",
    "Counterweight": "102 g (Adjustable)",
    "Overhang": "19.2 mm",
    "Effective Tonearm Length": "224 mm",
    "Headshell Mount": "H-4 Bayonet Mount",
    "Headshell Weight": "9 g",
    "Phono Output": "5.5 mV"
  },
  "Wharfedale Evo 5.1": {
    "Type": "2-way bookshelf speaker",
    "Enclosure": "Bass reflex",
    "Bass Driver": "5\" (130mm) Black Woven Kevlar Cone",
    "Treble Driver": "35 x 70mm AMT",
    "Sensitivity": "87 dB (2.83V/1m)",
    "Recommended Amplifier Power": "25–100 W",
    "Peak SPL": "98 dB",
    "Nominal Impedance": "4 Ω (8Ω compatible)",
    "Minimum Impedance": "3.4 Ω",
    "Frequency Response (±3dB)": "56 Hz–24 kHz",
    "Bass Extension (-6dB)": "46 Hz",
    "Crossover Frequency": "2.7 kHz",
    "Cabinet Volume": "11.5 L",
    "Net Weight": "8.0 kg"
  },
  "Wharfedale Evo 5.2": {
    "Type": "3-way bookshelf speaker",
    "Enclosure": "Bass reflex",
    "Bass Driver": "6\" (150mm) Black Woven Kevlar Cone",
    "Midrange Driver": "2\" (50mm) Soft Dome",
    "Treble Driver": "35 x 70mm AMT",
    "Sensitivity": "88 dB (2.83V/1m)",
    "Recommended Amplifier Power": "25–120 W",
    "Peak SPL": "105 dB",
    "Nominal Impedance": "4 Ω (8Ω compatible)",
    "Minimum Impedance": "3.2 Ω",
    "Frequency Response (±3dB)": "44 Hz–24 kHz",
    "Bass Extension (-6dB)": "38 Hz",
    "Crossover Frequencies": "800 Hz, 4.3 kHz",
    "Cabinet Volume": "27.2 L",
    "Net Weight": "15.0 kg"
  },
  "Wharfedale Evo 5.3": {
    "Type": "3-way floorstanding speaker",
    "Enclosure": "Bass reflex",
    "Bass Drivers": "2x 5\" (130mm) Black Woven Kevlar Cone",
    "Midrange Driver": "2\" (50mm) Soft Dome",
    "Treble Driver": "35 x 70mm AMT",
    "Sensitivity": "88 dB (2.83V/1m)",
    "Recommended Amplifier Power": "25–150 W",
    "Peak SPL": "106 dB",
    "Nominal Impedance": "4 Ω (8Ω compatible)",
    "Minimum Impedance": "3.5 Ω",
    "Frequency Response (±3dB)": "46 Hz–24 kHz",
    "Bass Extension (-6dB)": "40 Hz",
    "Crossover Frequencies": "825 Hz, 4 kHz",
    "Cabinet Volume": "35.4 L",
    "Net Weight": "21.5 kg"
  },
  "Wharfedale Evo 5.4": {
    "Type": "3-way floorstanding speaker",
    "Enclosure": "Bass reflex",
    "Bass Drivers": "2x 6\" (150mm) Black Woven Kevlar Cone",
    "Midrange Driver": "2\" (50mm) Soft Dome",
    "Treble Driver": "35 x 70mm AMT",
    "Sensitivity": "90 dB (2.83V/1m)",
    "Recommended Amplifier Power": "30–200 W",
    "Peak SPL": "108 dB",
    "Nominal Impedance": "4 Ω (8Ω compatible)",
    "Minimum Impedance": "4.3 Ω",
    "Frequency Response (±3dB)": "42 Hz–24 kHz",
    "Bass Extension (-6dB)": "36 Hz",
    "Crossover Frequencies": "1.1 kHz, 4 kHz",
    "Cabinet Volume": "59.5 L",
    "Net Weight": "31.2 kg"
  },
  "Wharfedale Evo 5.C": {
    "Type": "2-way centre channel speaker",
    "Enclosure": "Bass reflex",
    "Bass Drivers": "2x 5\" (130mm) Black Woven Kevlar Cone",
    "Treble Driver": "35 x 70mm AMT",
    "Sensitivity": "89 dB (2.83V/1m)",
    "Recommended Amplifier Power": "25–120 W",
    "Peak SPL": "103 dB",
    "Nominal Impedance": "4 Ω (8Ω compatible)",
    "Minimum Impedance": "4.1 Ω",
    "Frequency Response (±3dB)": "56 Hz–24 kHz",
    "Bass Extension (-6dB)": "49 Hz",
    "Crossover Frequency": "2.3 kHz",
    "Cabinet Volume": "14 L",
    "Net Weight": "12.4 kg"
  },
  "Audio Technica AT-VM740ML": {
    "Type": "VM Type (Moving Magnet)",
    "Frequency Response": "20–27,000 Hz",
    "Channel Separation": "28 dB (1 kHz)",
    "Vertical Tracking Angle": "23°",
    "Vertical Tracking Force": "1.8–2.2 g (2.0 g standard)",
    "Stylus Construction": "Nude square shank",
    "Stylus Shape": "2.2 x 0.12 mil MicroLine®",
    "Stylus Size": "0.12 x 2.2 mil",
    "Cantilever": "Aluminum tapered pipe",
    "Output Voltage": "4.0 mV (at 1 kHz, 5 cm/sec)",
    "Output Channel Balance": "1.0 dB (1 kHz)",
    "Coil Impedance": "2,700 Ω (1 kHz)",
    "DC Resistance": "800 Ω",
    "Coil Inductance": "460 mH (1 kHz)",
    "Recommended Load Impedance": "47,000 Ω",
    "Recommended Load Capacitance": "100–200 pF",
    "Static Compliance": "40 x 10⁻⁶ cm/dyne",
    "Dynamic Compliance": "10 x 10⁻⁶ cm/dyne (100 Hz)",
    "Mounting": "Half-inch",
    "Replacement Stylus": "VMN40ML",
    "Weight": "8.0 g (0.3 oz)"
  },
  "Parasound 275": {
    "Type": "2-channel Class AB power amplifier",
    "Power output (8Ω, stereo)": "75 W/ch RMS, both channels driven",
    "Power output (4Ω, stereo)": "125 W/ch RMS, both channels driven",
    "Power output (2Ω, stereo)": "125 W/ch RMS, both channels driven",
    "Power output (bridged mono)": "200 W RMS into 4Ω or 8Ω",
    "Peak current": "30 A per channel",
    "High pass filter": "18 dB/oct, switchable 20 Hz or 40 Hz",
    "Trigger": "DC 12V with looping output",
    "Power consumption (full output)": "350 W"
  },
  "Dual 1229": { 
    "Effective Mass": "~11 g", 
    "Effective Length": "~222 mm", 
    "Mounting Type": "Proprietary Dual bayonet/plug-in headshell mount (non-standard; integrated straight arm with detachable headshell)" 
  },
  "Schiit Lokius": {
    "Type": "6-band LC (inductor-capacitor) balanced equalizer",
    "EQ Bands": "20Hz, 120Hz, 400Hz, 2kHz, 6kHz, 16kHz",
    "Inputs": "Balanced XLR and single-ended RCA (switchable)",
    "Outputs": "Balanced XLR and single-ended RCA (both active simultaneously)",
    "Max input level (single-ended)": "2V RMS",
    "Max input level (balanced)": "4V RMS",
    "Bypass": "Relay-switched full bypass (relay and resistor only in signal path)",
    "Power": "14–16VAC, 1–2A"
  },
  "Schiit Mani 2": {
    "Type": "MM/MC phono preamplifier",
    "Gain options": "33dB, 42dB, 48dB, 60dB",
    "Default gain": "42dB (Input=H, Output=L)",
    "MM loading (default)": "47pF / 47kΩ",
    "MC loading options": "200Ω, 47Ω, ~38Ω (both switches in)",
    "Additional capacitance options": "+47pF, +100pF, or ~200pF total",
    "Low-frequency filter": "6dB or 12dB switchable",
    "Power": "16VAC wall-wart"
  },
  "Fosi ZD3": {
    "Type": "DAC",
    "Chipset": "XMOS XU316 + ESS 9039Q2M + QCC3031 + LME49720",
    "Output voltage (XLR)": "5V RMS",
    "Output voltage (RCA)": "2.5V RMS",
    "Inputs": "USB, HDMI (ARC), Coaxial, Optical, Bluetooth",
    "Outputs": "XLR balanced, RCA unbalanced",
    "SNR": "126dB",
    "THD+N": "<0.00008%",
    "Dynamic Range": "126dB",
    "Noise Floor": "≤2µV",
    "Frequency Response": "20Hz–20kHz (±0.1dB)",
    "Max USB sampling rate": "PCM 32bit/768kHz, DSD512",
    "Max Optical/Coaxial sampling rate": "PCM 24bit/192kHz",
    "Bluetooth": "5.0, aptX HD, aptX, AAC, SBC",
    "Power": "DC 12V 1.5A"
  },
  "MartinLogan Motion XT F200": {
    "Type": "3-way floorstanding speaker",
    "Frequency Response": "27Hz–25kHz ±3dB",
    "Sensitivity (2.83V/1m)": "92dB",
    "Nominal Impedance": "4Ω",
    "Crossover Frequencies": "300Hz, 2600Hz",
    "Recommended Amp Power": "20–600W",
    "Cabinet": "Bottom-ported bass reflex",
    "Binding Posts": "5-way bi-wire/bi-amp capable",
    "High Frequency Driver": "1.25\"x2.4\" Gen2 Obsidian Folded Motion XT tweeter",
    "Mid Frequency Driver": "6.5\" Nomex-Kevlar",
    "Low Frequency Drivers": "3x 8\" aluminum"
  },
  "MartinLogan Motion XT F100": {
    "Type": "3-way floorstanding speaker",
    "Frequency Response": "31Hz–25kHz ±3dB",
    "Sensitivity (2.83V/1m)": "92dB",
    "Nominal Impedance": "4Ω",
    "Crossover Frequencies": "280Hz, 2600Hz",
    "Recommended Amp Power": "20–450W",
    "Cabinet": "Bottom-ported bass reflex",
    "Binding Posts": "5-way bi-wire/bi-amp capable",
    "High Frequency Driver": "1.25\"x2.4\" Gen2 Obsidian Folded Motion XT tweeter",
    "Mid Frequency Driver": "6.5\" Nomex-Kevlar",
    "Low Frequency Drivers": "3x 6.5\" aluminum"
  },
  "MartinLogan Motion XT C100": {
    "Type": "2.5-way center channel speaker",
    "Frequency Response": "42Hz–25kHz ±3dB",
    "Sensitivity (2.83V/1m)": "93dB",
    "Nominal Impedance": "5Ω",
    "Crossover Frequencies": "1300Hz, 2500Hz",
    "Recommended Amp Power": "20–300W",
    "Cabinet": "Rear-ported, flippable",
    "Binding Posts": "5-way bi-wire/bi-amp capable",
    "High Frequency Driver": "1.25\"x2.4\" Gen2 Obsidian Folded Motion XT tweeter",
    "Low Frequency Drivers": "2x 6.5\" Nomex-Kevlar"
  },
  "MartinLogan Motion XT B100": {
    "Type": "2-way bookshelf speaker",
    "Frequency Response": "45Hz–25kHz ±3dB",
    "Sensitivity (2.83V/1m)": "93dB",
    "Nominal Impedance": "4Ω",
    "Crossover Frequency": "2600Hz",
    "Recommended Amp Power": "20–250W",
    "Cabinet": "Rear-ported bass reflex",
    "Binding Posts": "5-way bi-wire/bi-amp capable",
    "High Frequency Driver": "1.25\"x2.4\" Gen2 Obsidian Folded Motion XT tweeter",
    "Low Frequency Driver": "6.5\" Kevlar"
  },
  "MartinLogan Motion F20": {
    "Type": "3-way floorstanding speaker",
    "Frequency Response": "35Hz–25kHz ±3dB",
    "Sensitivity (2.83V/1m)": "92dB",
    "Nominal Impedance": "4Ω",
    "Crossover Frequencies": "230Hz, 2600Hz",
    "Recommended Amp Power": "20–250W",
    "Cabinet": "Bottom-ported bass reflex",
    "Binding Posts": "5-way bi-wire/bi-amp capable",
    "High Frequency Driver": "1\"x1.4\" Gen2 Obsidian Folded Motion tweeter",
    "Mid Frequency Driver": "5.5\" woven fiberglass",
    "Low Frequency Drivers": "2x 6.5\" aluminum"
  },
  "MartinLogan Motion F10": {
    "Type": "3-way floorstanding speaker",
    "Frequency Response": "38Hz–25kHz ±3dB",
    "Sensitivity (2.83V/1m)": "92dB",
    "Nominal Impedance": "4Ω",
    "Crossover Frequencies": "280Hz, 3000Hz",
    "Recommended Amp Power": "20–250W",
    "Cabinet": "Bottom-ported bass reflex",
    "Binding Posts": "5-way bi-wire/bi-amp capable",
    "High Frequency Driver": "1\"x1.4\" Gen2 Obsidian Folded Motion tweeter",
    "Mid Frequency Driver": "5.5\" woven fiberglass",
    "Low Frequency Drivers": "2x 5.5\" aluminum"
  },
  "MartinLogan Motion C10": {
    "Type": "2.5-way center channel speaker",
    "Frequency Response": "63Hz–25kHz ±3dB",
    "Sensitivity (2.83V/1m)": "93dB",
    "Nominal Impedance": "4Ω",
    "Recommended Amp Power": "20–200W",
    "Cabinet": "Rear-ported, flippable",
    "Binding Posts": "5-way bi-wire/bi-amp capable",
    "High Frequency Driver": "1\"x1.4\" Gen2 Obsidian Folded Motion tweeter",
    "Mid Frequency Drivers": "2x 5.5\" woven fiberglass"
  },
  "MartinLogan Motion B10": {
    "Type": "2-way bookshelf speaker",
    "Frequency Response": "56Hz–25kHz ±3dB",
    "Sensitivity (2.83V/1m)": "92dB",
    "Nominal Impedance": "5Ω",
    "Recommended Amp Power": "20–200W",
    "Cabinet": "Rear-ported bass reflex",
    "Binding Posts": "5-way bi-wire/bi-amp capable",
    "High Frequency Driver": "1\"x1.4\" Gen2 Obsidian Folded Motion tweeter",
    "Mid/Bass Driver": "5.5\" woven fiberglass"
  },
  "MartinLogan Motion MP10": {
    "Type": "2-way bookshelf/wall-mount speaker",
    "Frequency Response": "81Hz–25kHz ±3dB",
    "Sensitivity (2.83V/1m)": "92dB",
    "Nominal Impedance": "5Ω",
    "Recommended Amp Power": "20–200W",
    "High Frequency Driver": "1\"x1.4\" Gen2 Obsidian Folded Motion tweeter",
    "Mid/Bass Driver": "5.5\" woven fiberglass"
  },
  "MartinLogan Foundation F2": {
    "Type": "3-way floorstanding speaker",
    "Frequency Response": "36Hz–23kHz ±3dB",
    "Sensitivity (2.83V/1m)": "92dB",
    "Nominal Impedance": "4Ω",
    "Crossover Frequencies": "330Hz, 3600Hz",
    "Recommended Amp Power": "15–200W",
    "Cabinet": "Rear-ported bass reflex",
    "High Frequency Driver": "1\" Gen2 Obsidian Folded Motion S tweeter",
    "Mid Frequency Driver": "5.5\" aluminum",
    "Low Frequency Drivers": "3x 6.5\" aluminum"
  },
  "MartinLogan Foundation F1": {
    "Type": "3-way floorstanding speaker",
    "Frequency Response": "41Hz–23kHz ±3dB",
    "Sensitivity (2.83V/1m)": "92dB",
    "Nominal Impedance": "4Ω",
    "Crossover Frequencies": "240Hz, 3700Hz",
    "Recommended Amp Power": "15–200W",
    "Cabinet": "Rear-ported bass reflex",
    "High Frequency Driver": "1\" Gen2 Obsidian Folded Motion S tweeter",
    "Mid Frequency Driver": "5.5\" aluminum",
    "Low Frequency Drivers": "3x 5.5\" aluminum"
  },
  "MartinLogan Foundation B2": {
    "Type": "2-way bookshelf speaker",
    "Frequency Response": "42Hz–23kHz ±3dB",
    "Sensitivity (2.83V/1m)": "90dB",
    "Nominal Impedance": "5Ω",
    "Crossover Frequency": "3800Hz",
    "Recommended Amp Power": "15–100W",
    "Cabinet": "Rear-ported bass reflex",
    "High Frequency Driver": "1\" Gen2 Obsidian Folded Motion S tweeter",
    "Low Frequency Driver": "6.5\" aluminum"
  },
  "MartinLogan Foundation B1": {
    "Type": "2-way bookshelf speaker",
    "Frequency Response": "48Hz–23kHz ±3dB",
    "Sensitivity (2.83V/1m)": "89dB",
    "Nominal Impedance": "5Ω",
    "Crossover Frequency": "3400Hz",
    "Recommended Amp Power": "15–100W",
    "Cabinet": "Rear-ported bass reflex",
    "High Frequency Driver": "1\" Gen2 Obsidian Folded Motion S tweeter",
    "Low Frequency Driver": "5.5\" aluminum"
  },
  "MartinLogan Foundation C1": {
    "Type": "2.5-way center channel speaker",
    "Frequency Response": "53Hz–23kHz ±3dB",
    "Sensitivity (2.83V/1m)": "91dB",
    "Nominal Impedance": "4Ω",
    "Cabinet": "Rear-ported bass reflex",
    "High Frequency Driver": "1\" Gen2 Obsidian Folded Motion S tweeter",
    "Low Frequency Drivers": "2x 5.5\" aluminum"
  },
  "Emotiva basX A2": {
    "Type": "Stereo power amplifier",
    "Channels": "2",
    "Power output (8Ω, all channels)": "160W RMS/ch, 20Hz–20kHz, THD <0.1%",
    "Power output (4Ω, all channels)": "250W RMS/ch, 1kHz, THD <1%",
    "Input sensitivity": "1.2V",
    "Gain": "29dB",
    "THD+N": "<0.02% A-weighted at rated power, 1kHz, 8Ω",
    "SNR": ">112dB referenced to rated power (A-weighted)",
    "Input impedance": "27kΩ",
    "Minimum load impedance": "4Ω",
    "Damping factor": ">500 (8Ω)",
    "Frequency response": "5Hz–80kHz (+0/–1.8dB)",
    "Input connections": "RCA unbalanced"
  },
  "Emotiva basX A3": {
    "Type": "3-channel power amplifier",
    "Channels": "3",
    "Power output (8Ω, all channels)": "140W RMS/ch, 20Hz–20kHz, THD <0.1%",
    "Power output (4Ω, all channels)": "200W RMS/ch, 1kHz, THD <1%",
    "Power output (8Ω, 2ch driven)": "150W RMS/ch",
    "Power output (4Ω, 2ch driven)": "250W RMS/ch",
    "Input sensitivity": "1.25V",
    "Gain": "29dB",
    "THD+N": "<0.02% A-weighted at rated power, 1kHz, 8Ω",
    "SNR": ">112dB referenced to rated power (A-weighted)",
    "Input impedance": "27kΩ",
    "Minimum load impedance": "4Ω",
    "Damping factor": ">500 (8Ω)",
    "Frequency response": "5Hz–80kHz (+0/–1.8dB)",
    "Input connections": "RCA unbalanced"
  },
  "Emotiva basX A4": {
    "Type": "4-channel power amplifier",
    "Channels": "4",
    "Power output (8Ω, all channels)": "100W RMS/ch, 20Hz–20kHz, THD <0.1%",
    "Power output (4Ω, all channels)": "130W RMS/ch, 1kHz, THD <1%",
    "Power output (8Ω, 2ch driven)": "100W RMS/ch",
    "Power output (4Ω, 2ch driven)": "175W RMS/ch",
    "Input sensitivity": "1.2V",
    "Gain": "29dB",
    "THD+N": "<0.02% A-weighted at rated power, 1kHz, 8Ω",
    "SNR": ">112dB referenced to rated power (A-weighted)",
    "Input impedance": "27kΩ",
    "Minimum load impedance": "4Ω",
    "Damping factor": ">500 (8Ω)",
    "Frequency response": "5Hz–80kHz (+0/–1.8dB)",
    "Input connections": "RCA unbalanced"
  },
  "Emotiva basX A5": {
    "Type": "5-channel power amplifier",
    "Channels": "5",
    "Power output (8Ω, all channels)": "95W RMS/ch, 20Hz–20kHz, THD <0.02%",
    "Power output (4Ω, all channels)": "130W RMS/ch, 1kHz, THD <1%",
    "Power output (8Ω, 2ch driven)": "120W RMS/ch",
    "Power output (4Ω, 2ch driven)": "175W RMS/ch",
    "Input sensitivity": "1.2V",
    "Gain": "29dB",
    "THD+N": "<0.02% A-weighted at rated power, 1kHz, 8Ω",
    "SNR": ">112dB referenced to rated power (A-weighted)",
    "Input impedance": "27kΩ",
    "Minimum load impedance": "4Ω",
    "Damping factor": ">500 (8Ω)",
    "Frequency response": "5Hz–80kHz (+0/–1.8dB)",
    "Input connections": "RCA unbalanced"
  },
  "Emotiva basX A7": {
    "Type": "7-channel power amplifier",
    "Channels": "7",
    "Power output (8Ω, all channels)": "90W RMS/ch, 20Hz–20kHz, THD <0.02%",
    "Power output (4Ω, all channels)": "125W RMS/ch, 1kHz, THD <1%",
    "Power output (8Ω, 2ch driven)": "120W RMS/ch",
    "Power output (4Ω, 2ch driven)": "175W RMS/ch",
    "Input sensitivity": "1.2V",
    "Gain": "29dB",
    "THD+N": "<0.02% A-weighted at rated power, 1kHz, 8Ω",
    "SNR": ">112dB referenced to rated power (A-weighted)",
    "Input impedance": "27kΩ",
    "Minimum load impedance": "4Ω",
    "Damping factor": ">500 (8Ω)",
    "Frequency response": "5Hz–80kHz (+0/–1.8dB)",
    "Input connections": "RCA unbalanced"
  },
  "Geshelli J3 Pro": {
    "Type": "DAC",
    "DAC chip": "AK4491 + AK4499EXEQ",
    "Inputs": "2x Toslink, 2x Coax, 1x USB (optional)",
    "Outputs": "RCA unbalanced, XLR balanced (simultaneous)",
    "Max input rate": "Up to 384kHz PCM, DSD256",
    "Input format": "Up to 32bit stereo",
    "Frequency Response": "20Hz–20,000Hz",
    "Compatibility": "AES3, IEC660958, SPDIF, EIAJ CP1201",
    "Power": "12V DC"
  },
  "Parasound 275 v.2": {
    "Type": "2-channel Class AB power amplifier",
    "Power output (8Ω, stereo)": "90 W/ch RMS, both channels driven",
    "Power output (4Ω, stereo)": "150 W/ch RMS, both channels driven",
    "Power output (2Ω, stereo)": "150 W/ch RMS, both channels driven (load switch to 2–3Ω)",
    "Power output (bridged mono, 8Ω)": "200 W RMS",
    "Power output (bridged mono, 4Ω)": "200 W RMS (load switch to 2–3Ω)",
    "Peak current": "20 A per channel",
    "Frequency Response": "20 Hz–50 kHz, +0/–3 dB at 1 W",
    "Dynamic Headroom": "1.3 dB",
    "THD (full rated output)": "0.35%",
    "THD (average listening levels)": "0.025%",
    "IM Distortion": "0.05%",
    "SNR (rated output, A-weighted)": "110 dB IHF A-weighted",
    "SNR (rated output, unweighted)": "103 dB",
    "Input Impedance": "33 kΩ",
    "Input Sensitivity": "800 mV for full rated output (28 dB gain)",
    "Inter-channel Crosstalk": "80 dB at 1 kHz; 72 dB at 10 kHz; 65 dB at 20 kHz",
    "Damping Factor": ">150 at 20 Hz",
    "Trigger": "DC 9–12V, 15 mA",
    "Power consumption (full output)": "350 W"
  },
  "Parasound NC 200Pre": {
    "Type": "Stereo preamplifier with built-in DAC",
    "Frequency Response (main)": "20 Hz–20 kHz, +0/–0.05 dB",
    "Frequency Response (extended)": "10 Hz–80 kHz, +0/–3 dB",
    "THD (20 Hz–20 kHz)": "<0.03%",
    "Interchannel Crosstalk": "75 dB at 20 kHz",
    "Input Sensitivity": "250 mV = 1 V output (12 dB total gain at volume 100)",
    "Maximum Output": "3.5 V",
    "Phono Stage — MM gain / impedance": "40 dB / 47 kΩ",
    "Phono Stage — MC gain / impedance": "50 dB / 100 Ω",
    "Phono Stage Input Capacitance": "150 pF",
    "Line Level Input Impedance": "24 kΩ",
    "Output Impedance": "470 Ω",
    "SNR (line inputs, A-weighted)": ">100 dB, input shorted, IHF A-weighted",
    "SNR (line inputs, unweighted)": ">90 dB, input shorted",
    "DAC IC": "Burr-Brown PCM1798",
    "DAC max rate (USB)": "96 kHz / 24-bit",
    "DAC max rate (Optical / Coax)": "192 kHz / 24-bit",
    "DC Trigger Output": "12 Vdc, 50 mA",
    "Power": "10 W max; <0.5 W standby; 100–250 VAC 50/60 Hz (auto)"
  },
  "Neumi BS5": {
    "Type": "2-way bookshelf speaker",
    "Woofer": "5\" fiberglass cone with rubber surround",
    "Tweeter": "1\" silk dome with waveguide",
    "Crossover": "12 dB/oct tweeter; 12 dB/oct woofer",
    "Enclosure": "Dual front-ported",
    "Frequency Response": "50 Hz–20 kHz (typical in-room)",
    "Nominal Impedance": "6 Ω",
    "Sensitivity": "86 dB (1W/1M)",
    "Power Handling": "15–100 W/ch"
  },
  "Sumiko Oyster": {
    "Type": "MM (Moving Magnet)",
    "Series": "Oyster Series",
    "Mass": "5.5 g",
    "Stylus": "0.7 mil Spherical",
    "Cantilever": "Aluminum",
    "Internal Impedance": "1,130 Ω",
    "Load Impedance": "47 kΩ",
    "Frequency Response": "30 Hz–20 kHz",
    "Output Voltage": "5.0 mV",
    "Channel Separation": "22 dB (1 kHz)",
    "Channel Balance": "2 dB (1 kHz)",
    "Dynamic Compliance": "10×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "25°",
    "Tracking Force": "1.5–2.5 g (rec. 2.3 g)",
    "Replacement Stylus": "RS Oyster"
  },
  "Sumiko Black Pearl": {
    "Type": "MM (Moving Magnet)",
    "Series": "Oyster Series",
    "Mass": "5.7 g",
    "Stylus": "0.7 mil Spherical",
    "Cantilever": "Aluminum",
    "Internal Impedance": "1,130 Ω",
    "Load Impedance": "47 kΩ",
    "Frequency Response": "18 Hz–20 kHz",
    "Output Voltage": "4.0 mV",
    "Channel Separation": "23 dB (1 kHz)",
    "Channel Balance": "2 dB (1 kHz)",
    "Dynamic Compliance": "10×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "25°",
    "Tracking Force": "1.5–2.0 g (rec. 2.0 g)",
    "Replacement Stylus": "RS Black Pearl"
  },
  "Sumiko Pearl": {
    "Type": "MM (Moving Magnet)",
    "Series": "Oyster Series",
    "Mass": "5.7 g",
    "Stylus": "0.3 x 0.7 mil Elliptical",
    "Cantilever": "Aluminum",
    "Internal Impedance": "1,130 Ω",
    "Load Impedance": "47 kΩ",
    "Frequency Response": "12 Hz–20 kHz",
    "Output Voltage": "4.0 mV (1 kHz)",
    "Channel Separation": "25 dB (1 kHz)",
    "Channel Balance": "2 dB (1 kHz)",
    "Dynamic Compliance": "10×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "25°",
    "Tracking Force": "1.5–2.0 g (rec. 2.0 g)",
    "Replacement Stylus": "RS Pearl"
  },
  "Sumiko Rainier": {
    "Type": "MM (Moving Magnet)",
    "Series": "Oyster Series",
    "Mass": "6.7 g",
    "Stylus": "Elliptical (0.3 x 0.7 mil)",
    "Cantilever": "⌀0.6mm Aluminum",
    "Internal Impedance": "1,130 Ω (1 kHz)",
    "Load Impedance": "47 kΩ",
    "Frequency Response": "15 Hz–20 kHz",
    "Output Voltage": "5.0 mV (3.54 cm/sec, 1 kHz)",
    "Channel Separation": "25 dB (1 kHz)",
    "Channel Balance": "<2 dB (1 kHz)",
    "Dynamic Compliance": "10×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "25°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "RS Rainier / Olympia / Moonstone / Wellfleet / Amethyst"
  },
  "Sumiko Olympia": {
    "Type": "MM (Moving Magnet)",
    "Series": "Oyster Series",
    "Mass": "6.7 g",
    "Stylus": "Elliptical (0.3 x 0.7 mil)",
    "Cantilever": "⌀0.6mm Aluminum Pipe",
    "Internal Impedance": "1,130 Ω (1 kHz)",
    "Load Impedance": "47 kΩ",
    "Frequency Response": "12 Hz–25 kHz",
    "Output Voltage": "4.0 mV (3.54 cm/sec, 1 kHz)",
    "Channel Separation": "25 dB (1 kHz)",
    "Channel Balance": "<1.5 dB (1 kHz)",
    "Dynamic Compliance": "12×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "25°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "RS Rainier / Olympia / Moonstone / Wellfleet / Amethyst"
  },
  "Sumiko Moonstone": {
    "Type": "MM (Moving Magnet)",
    "Series": "Oyster Series",
    "Mass": "6.7 g",
    "Stylus": "Elliptical (0.3 x 0.7 mil)",
    "Cantilever": "⌀0.5mm Aluminum Pipe",
    "Internal Impedance": "1,130 Ω (1 kHz)",
    "Load Impedance": "47 kΩ",
    "Frequency Response": "12 Hz–33 kHz",
    "Output Voltage": "3.0 mV (3.54 cm/sec, 1 kHz)",
    "Channel Separation": "30 dB (1 kHz)",
    "Channel Balance": "0.5 dB (1 kHz)",
    "Dynamic Compliance": "12×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "25°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "RS Rainier / Olympia / Moonstone / Wellfleet / Amethyst"
  },
  "Sumiko Wellfleet": {
    "Type": "MM (Moving Magnet)",
    "Series": "Oyster Series",
    "Mass": "6.7 g",
    "Stylus": "Nude Elliptical (0.3 x 0.7 mil)",
    "Cantilever": "⌀0.5mm Aluminum Pipe",
    "Internal Impedance": "1,130 Ω (1 kHz)",
    "Load Impedance": "47 kΩ",
    "Frequency Response": "12 Hz–30 kHz",
    "Output Voltage": "3.0 mV (3.54 cm/sec, 1 kHz)",
    "Channel Separation": "27 dB (1 kHz)",
    "Channel Balance": "<1 dB (1 kHz)",
    "Dynamic Compliance": "12×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "25°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "RS Rainier / Olympia / Moonstone / Wellfleet / Amethyst"
  },
  "Sumiko Amethyst": {
    "Type": "MM (Moving Magnet)",
    "Series": "Oyster Series",
    "Mass": "6.5 g",
    "Stylus": "Nude Line-Contact (0.2 x 0.8 mil)",
    "Cantilever": "⌀0.5mm Aluminum Pipe",
    "Internal Impedance": "700 Ω (1 kHz)",
    "Load Impedance": "47 kΩ",
    "Frequency Response": "12 Hz–35 kHz",
    "Output Voltage": "2.5 mV (3.54 cm/sec, 1 kHz)",
    "Channel Separation": "30 dB (1 kHz)",
    "Channel Balance": "<1 dB (1 kHz)",
    "Dynamic Compliance": "12×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "25°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "RS Rainier / Olympia / Moonstone / Wellfleet / Amethyst"
  },
  "Sumiko Blue Point No. 3 High": {
    "Type": "HOMC (High Output Moving Coil)",
    "Series": "Oyster Series",
    "Mass": "6.1 g",
    "Stylus": "0.3 x 0.7 mil Elliptical",
    "Cantilever": "⌀0.5mm Aluminum Pipe",
    "Internal Impedance": "135 Ω",
    "Load Impedance": "47 kΩ",
    "Frequency Response": "13 Hz–30 kHz",
    "Output Voltage": "2.5 mV (1 kHz)",
    "Channel Separation": "30 dB (1 kHz)",
    "Channel Balance": "<1 dB (1 kHz)",
    "Dynamic Compliance": "12×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "20°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "Re-Tip Exchange (see dealer)"
  },
  "Sumiko Blue Point No. 3 Low": {
    "Type": "LOMC (Low Output Moving Coil)",
    "Series": "Oyster Series",
    "Mass": "6.1 g",
    "Stylus": "0.3 x 0.7 mil Elliptical",
    "Cantilever": "⌀0.5mm Aluminum Pipe",
    "Internal Impedance": "28 Ω (1 kHz)",
    "Load Impedance": ">100 Ω (determine by ear)",
    "Frequency Response": "13 Hz–30 kHz",
    "Output Voltage": "0.5 mV (1 kHz)",
    "Channel Separation": "30 dB (1 kHz)",
    "Channel Balance": "<1 dB (1 kHz)",
    "Dynamic Compliance": "12×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "20°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "Re-Tip Exchange (see dealer)"
  },
  "Sumiko Songbird High": {
    "Type": "HOMC (High Output Moving Coil)",
    "Series": "Reference Series",
    "Mass": "7.4 g",
    "Stylus": "Elliptical (0.3 x 0.7 mil)",
    "Cantilever": "⌀0.5mm Reinforced Aluminum Pipe",
    "Internal Impedance": "135 Ω (1 kHz)",
    "Load Impedance": "47 kΩ",
    "Frequency Response": "12 Hz–30 kHz",
    "Output Voltage": "2.5 mV (3.54 cm/sec, 1 kHz)",
    "Channel Separation": "30 dB (1 kHz)",
    "Channel Balance": "<1 dB (1 kHz)",
    "Dynamic Compliance": "12×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "20°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "Re-Tip Exchange (see dealer)"
  },
  "Sumiko Songbird Low": {
    "Type": "LOMC (Low Output Moving Coil)",
    "Series": "Reference Series",
    "Mass": "7.4 g",
    "Stylus": "Elliptical (0.3 x 0.7 mil)",
    "Cantilever": "⌀0.5mm Reinforced Aluminum Pipe",
    "Internal Impedance": "28 Ω (1 kHz)",
    "Load Impedance": ">100 Ω (determine by ear)",
    "Frequency Response": "12 Hz–30 kHz",
    "Output Voltage": "0.5 mV (3.54 cm/sec, 1 kHz)",
    "Channel Separation": "30 dB (1 kHz)",
    "Channel Balance": "<1 dB (1 kHz)",
    "Dynamic Compliance": "12×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "20°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "Re-Tip Exchange (see dealer)"
  },
  "Sumiko Oriole": {
    "Type": "LOMC (Low Output Moving Coil)",
    "Series": "Reference Series",
    "Mass": "7.3 g",
    "Stylus": "Nude Shibata (6.5 x 40 µm)",
    "Cantilever": "⌀0.5mm Reinforced Aluminum Pipe",
    "Internal Impedance": "5.5 Ω (1 kHz)",
    "Load Impedance": ">55 Ω (determine by ear)",
    "Frequency Response": "12 Hz–45 kHz",
    "Output Voltage": "0.3 mV (3.54 cm/sec, 1 kHz)",
    "Channel Separation": "30 dB (1 kHz)",
    "Channel Balance": "<0.5 dB (1 kHz)",
    "Dynamic Compliance": "12×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "20°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "Re-Tip Exchange (see dealer)"
  },
  "Sumiko Starling": {
    "Type": "LOMC (Low Output Moving Coil)",
    "Series": "Reference Series",
    "Mass": "7.4 g",
    "Stylus": "Nude Low-Mass Microridge (2.5 x 75 µm)",
    "Cantilever": "⌀0.28mm Boron",
    "Internal Impedance": "28 Ω (1 kHz)",
    "Load Impedance": ">100 Ω (determine by ear)",
    "Frequency Response": "12 Hz–50 kHz",
    "Output Voltage": "0.5 mV (3.54 cm/sec, 1 kHz)",
    "Channel Separation": "30 dB (1 kHz)",
    "Channel Balance": "<0.5 dB (1 kHz)",
    "Dynamic Compliance": "12×10⁻⁶ cm/dyn (100 Hz)",
    "Load Capacitance": "100–200 pF",
    "Vertical Tracking Angle": "20°",
    "Tracking Force": "1.8–2.2 g (rec. 2.0 g)",
    "Replacement Stylus": "Re-Tip Exchange (see dealer)"
  }
};

function findCorrection(name) {
  const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Split on original string words, normalize each token — preserves word boundaries
  const tokenize = s => s.toLowerCase().split(/[\s\-_.]+/).map(t => t.replace(/[^a-z0-9]/g,'')).filter(Boolean);
  const n = normalize(name);
  const userTokens = tokenize(name);

  // 1. Exact normalized match
  let key = Object.keys(corrections).find(k => normalize(k) === n);

  // 2. Substring match (handles "Parasound 275" vs "Parasound 275 v1")
  if (!key) key = Object.keys(corrections).find(k => {
    const nk = normalize(k);
    return nk.includes(n) || n.includes(nk);
  });

  // 3. Token subset match (handles "Wharfedale 5.1" vs "Wharfedale Evo 5.1")
  // All user tokens must appear in the key's tokens
  if (!key) key = Object.keys(corrections).find(k => {
    const keyTokens = tokenize(k);
    return userTokens.length > 0 && userTokens.every(t => keyTokens.includes(t));
  });

  return key ? corrections[key] : null;
}

function formatCorrectedSpecs(name, type, specs) {
  const lines = Object.entries(specs).map(([k, v]) => `- ${k}: ${v}`).join("\n");
  return `**${name} (${type})**\n${lines}`;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

  try {
    const { components } = JSON.parse(event.body);
    const typeLabels = {
      amp:"Amplifier", preamp:"Preamplifier", speakers:"Speakers", dac:"DAC",
      turntable:"Turntable", tonearm:"Tonearm", cartridge:"Cartridge",
      phonopre:"Phono Preamp", streamer:"Streamer", cdplayer:"CD Player",
      cables:"Cables", headphones:"Headphones", other:"Other"
    };
    const specFields = {
      amp:       "power output (W/ch), input impedance (Ω), input sensitivity (mV)",
      preamp:    "gain (dB), input impedance (kΩ), output impedance (Ω)",
      speakers:  "nominal impedance (Ω), minimum impedance (Ω), sensitivity (dB/W/m), power handling (W)",
      dac:       "output voltage (Vrms), output impedance (Ω), THD+N",
      turntable: "drive type, speeds (RPM), tonearm effective mass (g)",
      tonearm:   "effective mass (g), effective length (mm), mounting type",
      cartridge: "type (MM/MC), output voltage (mV), dynamic compliance (µm/mN), internal impedance (Ω), tracking force (g), recommended loading (Ω), channel separation (dB)",
      phonopre:  "MM gain (dB), MC gain (dB), MM input impedance (kΩ), MC input impedance (Ω), output voltage",
      streamer:  "digital outputs, supported formats",
      cdplayer:  "output voltage (Vrms), digital outputs, THD",
      headphones:"impedance (Ω), sensitivity (dB/mW)",
      cables:    "type, impedance",
      other:     "key electrical specs"
    };

    const correctedBlocks = [];
    const needsAI = [];

    components.forEach((c, i) => {
      const corrected = findCorrection(c.name);
      if (corrected) {
        correctedBlocks.push(formatCorrectedSpecs(c.name, typeLabels[c.type] || c.type, corrected));
      } else {
        needsAI.push({ index: i, component: c });
      }
    });

    let aiText = "";
    if (needsAI.length > 0) {
      const numberedList = needsAI.map(({ index, component: c }) => {
        return `${index + 1}. [${typeLabels[c.type] || c.type}] ${c.name}\n   Required: ${specFields[c.type] || "key specs"}`;
      }).join("\n");

      const prompt = `You are an audio equipment specifications database with expert knowledge of hi-fi components. For each component below, report the exact published manufacturer specifications.

IMPORTANT:
- If you know this EXACT model: state its specs precisely
- If NOT certain: add "⚠ Specs shown are for [similar model] — exact specs for [entered model] not confirmed" then provide your best known specs
- Never skip a component. Estimate with (~) only if no data available.
- NEVER ask clarifying questions. NEVER request more information. Always output spec blocks — one per component, no exceptions.

${numberedList}

Output one block per component:
**[Name] ([Type])**
- spec: value

All ${needsAI.length} components required. No summary text. No questions.`;

      const body = JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 650,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: "api.anthropic.com",
          path: "/v1/messages",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "Content-Length": Buffer.byteLength(body),
          },
        }, res => { let d = ""; res.on("data", c => d += c); res.on("end", () => resolve(d)); });
        req.on("error", reject);
        req.write(body);
        req.end();
      });

      const parsed = JSON.parse(raw);
      if (parsed.error) throw new Error(parsed.error.message);
      aiText = parsed.content[0].text;
    }

    const correctedSection = correctedBlocks.length > 0
      ? correctedBlocks.join("\n\n") + "\n\n"
      : "";

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: (correctedSection + aiText).trim() })
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
