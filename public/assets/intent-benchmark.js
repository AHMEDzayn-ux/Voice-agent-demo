window.INTENT_BENCHMARK = {
  "method": "Measured 25 November 2026, using one run per provider and clean recording at 1×. First-text timing starts at the first 16 kHz audio packet. That initial text may be revised. Qwen 3.8 27B selected a caller goal from the same choices for every transcript, then extracted the scenario fields separately. The model saw only the raw transcript and the scoring instructions. The best result gets the goal right and recovers the most fields. Numeric formatting is normalized while leading zeros are retained. Try telephone and noisy variants in Live test. WER and CER are available in the transcript comparisons.",
  "cases": [
    {
      "id": "code_switch/clean",
      "label": "Sinhala-English code-switching",
      "audio": "assets/code-clean.wav",
      "goal": "Explain why they use the internet",
      "finding": "Deepgram understood the goal and missed taking orders.",
      "fields": [
        {
          "id": "news_research",
          "label": "News or research"
        },
        {
          "id": "keep_in_touch",
          "label": "Keep in touch"
        },
        {
          "id": "email_social",
          "label": "Email and social media"
        },
        {
          "id": "promote_business",
          "label": "Promote a business"
        },
        {
          "id": "take_orders",
          "label": "Take orders"
        }
      ],
      "results": [
        {
          "provider": "deepgram",
          "status": "Complete",
          "firstSeconds": 2.41,
          "intentCorrect": true,
          "detectedGoal": "why the caller uses the internet",
          "details": {
            "news_research": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "keep_in_touch": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "email_social": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "promote_business": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "take_orders": {
              "expected": true,
              "actual": false,
              "correct": false
            }
          },
          "summary": "Review take orders",
          "transcript": "මම වැඩියෙන්ම අන්තර්ජාලය භාවිතා කරන්නේ තොරතුරු ලබා ගැනීමට ප් රවෘති දැනීම පර්යේෂණ පත් රිකා වගේ දේවල් ලබාගන්න භාවිතා කරනවා අ තව එක අරමුණක් හැටියට අනිත් අයත් සමඟ සම්බන්ධතා පවත්වා ගැනීමටත් අන්තර්ජාලය ඊමේල්, ඉන්ටරනෙට්, සෝෂල් මීඩියා එහෙම පාවිච්චි කරනවා තුන්වෙනිීක හැටියට මගේ ව් යාපාරයේ ප් රචාරක් කටයුතු ඇන ලබා ගැනීමටත් පාවිච්චි කරනවා."
        },
        {
          "provider": "gemini",
          "status": "Complete",
          "firstSeconds": 7.4,
          "intentCorrect": true,
          "detectedGoal": "why the caller uses the internet",
          "details": {
            "news_research": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "keep_in_touch": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "email_social": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "promote_business": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "take_orders": {
              "expected": true,
              "actual": true,
              "correct": true
            }
          },
          "summary": "All fields recovered",
          "transcript": "මම වැඩියෙන්ම අන්තර්ජාලය භාවිතා කරන්නේ තොරතුරු ලබා ගැනීමට, ප්‍රවृත්ති දැනීම පර්යේෂණ පత్రికා වගේ දේවල් ලබා ගන්න. භාවිතא කරනවා. තවත් ඒ කාර්മണක් හැටියට අනිත් අයත් සමඟ සම්බන්ධතා පවත්වා ගැනීමටත් අන්තර්ජය, ඊමේල්, ඉන්ටර්නෙට්, සෝෂਲ මීඩියා එහෙම පාවිච්චි කරනවා. තුන්වෙනි එක හැටියට මගේ ව්‍යාපਾਰයේ ප්‍රചാരක කටයුතු ඇනවුම් ලබා ගැනීමටත් පവിച്ചി කරනවා."
        },
        {
          "provider": "azure",
          "status": "Complete",
          "firstSeconds": 2.33,
          "intentCorrect": true,
          "detectedGoal": "why the caller uses the internet",
          "details": {
            "news_research": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "keep_in_touch": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "email_social": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "promote_business": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "take_orders": {
              "expected": true,
              "actual": true,
              "correct": true
            }
          },
          "summary": "All fields recovered",
          "transcript": "මම වැඩියෙන්ම අන්තර්ජාලය භාවිතා කරන්නේ තොරතුරු ලබාගැනීමට ප්රවෘත්ති දැනීම පර්යේෂ. පති්රකා වගේ දේවල් ලබාගන්න. භාවිතා කරනවා. X තව 1 අරමුණක් හැටියට අනිත් අයත් සමඟ සම්බන්ධතා පවත්වා ගැනීමටත්. අන්තර්ජාලය ඊමේල් ඉන්ටර්නෙට් සෝෂල් මීඩියා එහෙම පාවිච්චි කරනවා. ඇතුන්ගෙන් 1 හැටියට මගේ ව්යාපාරයේ ප්රචාරක කටයුතු ඇණවුම් ලබා ගැනීමටත් පාවිච්චි කරනවා."
        },
        {
          "provider": "openai",
          "status": "API credits exhausted in setup",
          "firstSeconds": null
        },
        {
          "provider": "groq",
          "status": "Complete",
          "firstSeconds": 6.14,
          "intentCorrect": false,
          "detectedGoal": "no clear goal",
          "details": {
            "news_research": {
              "expected": true,
              "actual": null,
              "correct": false
            },
            "keep_in_touch": {
              "expected": true,
              "actual": null,
              "correct": false
            },
            "email_social": {
              "expected": true,
              "actual": null,
              "correct": false
            },
            "promote_business": {
              "expected": true,
              "actual": null,
              "correct": false
            },
            "take_orders": {
              "expected": true,
              "actual": null,
              "correct": false
            }
          },
          "summary": "Review 5 fields",
          "transcript": "මිනින්නේ මේදින්නේ අපි කියෙන්නේ කියෙන්නේ නිත්ත්ත්ත්ත්ත් කියෙන්න. පාළවතාගිවාවින් මිනිවාරවා පසාවතාගින් ඇතිතාන් කිසානිරියේ තුත් කන්නේ කිරිතු නැති මම්ත්ත්ත්ත්ත් කරන්නේ. අපි ගන්නේ ලැන්සු නිවිලමියේ හමට පිනිතිරන් මේසුවක් කරනිනමෙන් එකත් දින්නයක් කිරියිරියක් පසුවින්නම් වෙන්නම් පෙරියක් අපි හිතින්නේ."
        }
      ]
    },
    {
      "id": "urban_fast/original",
      "label": "Fast urban speech: numbers and codes",
      "audio": "assets/urban-fast-original.mp4",
      "goal": "Dispute a card payment that was debited but did not reach the merchant",
      "finding": "Azure recovered LKR 28,550, the time and the corrected NIC ending. Every scored model missed the exact email.",
      "fields": [
        {
          "id": "debited_merchant_missing",
          "label": "Debit with missing merchant payment"
        },
        {
          "id": "amount_lkr",
          "label": "Payment amount (LKR)"
        },
        {
          "id": "payment_time",
          "label": "Payment time (24-hour clock)"
        },
        {
          "id": "corrected_nic_end",
          "label": "Corrected NIC ending"
        },
        {
          "id": "email",
          "label": "Email address"
        }
      ],
      "results": [
        {
          "provider": "deepgram",
          "status": "Complete",
          "firstSeconds": 2.72,
          "intentCorrect": true,
          "detectedGoal": "a payment dispute",
          "details": {
            "debited_merchant_missing": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "amount_lkr": {
              "expected": "28550",
              "actual": "28500",
              "correct": false
            },
            "payment_time": {
              "expected": "16:45",
              "actual": "16:40",
              "correct": false
            },
            "corrected_nic_end": {
              "expected": "1235V",
              "actual": "1235V1",
              "correct": false
            },
            "email": {
              "expected": "nimal.jayasuriya88@gmail.com",
              "actual": "nimal.jayasooriya88@gmail.com",
              "correct": false
            }
          },
          "summary": "Review 4 fields",
          "transcript": "හෙලෝ මට මගේ ක් රෙඩිට් කාඩ් එකේ ට් රාන්ස්action එකක් ගැන පොඩ්ඩක් දැනගන්න ඕනේ. ඊයේ හවස හතරයි 40 විතර මම ඔන්ලයින් පේමන්ට් එකක් කළා. රුපියල් 28500ක් ක්. ඒක මගේ එකවුන්ට් එකෙන් ඩීඩ් වෙලා තියෙනවා. හැබැයි මර්න්ට් එකට ගිහින් නැහැ කියලා ඇප් එකේ පෙන්නන්නේ. මගේ nic නම්බ් එක ඉන්න පොඩ්ඩක්. 94 25යි 61යි 2.4v. අ නෑ සොරි අන්තිමට එක්ක 12 35යි V1 අ මගේ ඉමේල් එක නිමල් ජයසුවරයා 88 gmailල.com අ ඒක පොඩ්ඩක් චෙක් කරලා කියන්නකෝ මොකද වෙලා තියෙන්නේ කියලා අ මම අදම ඒකසෙඩල් කරගන්න ඕනේ මට."
        },
        {
          "provider": "gemini",
          "status": "Complete",
          "firstSeconds": 26.4,
          "intentCorrect": true,
          "detectedGoal": "a payment dispute",
          "details": {
            "debited_merchant_missing": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "amount_lkr": {
              "expected": "28550",
              "actual": "28550",
              "correct": true
            },
            "payment_time": {
              "expected": "16:45",
              "actual": "16:45",
              "correct": true
            },
            "corrected_nic_end": {
              "expected": "1235V",
              "actual": null,
              "correct": false
            },
            "email": {
              "expected": "nimal.jayasuriya88@gmail.com",
              "actual": "nimaljayasuriya88@gmail.com",
              "correct": false
            }
          },
          "summary": "Review 2 fields",
          "transcript": "මගේ ක්‍රෙඩिट කාඩ් එකේ ට්‍රාන්සැක්ෂන් එකක් ගැන පොඩ්ඩක් දැනගන්න ඕනේ. ඊයේ හවස 4:45 ට විතර මම ඔන්ලයින් පේමන්ට් එකක් කළා. රුපියල් 28,550 ක්. ඒක මගේ එකවුන්ට් එකෙන් ඩීඩක්ට් වෙලා තියෙනවා. හැබැයි මර්චන්ට් එකට ගിഹින් නැහැ කියලා ඇප් එකේ පෙන්വන්නේ. මගේ එන්.අයි.සී නම්බර් එක ඉන්න පොඩ්ඩක්.  942561234V නැහැ නැහැ සොරි. අಂತಿමට 12:35 විතර වෙන්න ඕනේ. මගේ ඊමේල් එක nimaljayasuriya88@gmail.com ඒක පොඩ්ඩක් චെക്ക് කරලා කියන්නකෝ මොකද වෙලා තියෙන්නේ කියලා. මම අදම ඒක ශෙඩ്യൂൾ කරගන්න ඕනේ මට."
        },
        {
          "provider": "azure",
          "status": "Complete",
          "firstSeconds": 2.63,
          "intentCorrect": true,
          "detectedGoal": "a payment dispute",
          "details": {
            "debited_merchant_missing": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "amount_lkr": {
              "expected": "28550",
              "actual": "28550",
              "correct": true
            },
            "payment_time": {
              "expected": "16:45",
              "actual": "16:45",
              "correct": true
            },
            "corrected_nic_end": {
              "expected": "1235V",
              "actual": "1235V",
              "correct": true
            },
            "email": {
              "expected": "nimal.jayasuriya88@gmail.com",
              "actual": "nimal.jayasuriya78@gmail.com",
              "correct": false
            }
          },
          "summary": "Review email address",
          "transcript": "හැමෝම මට මගේ ක්රෙඩිට් කාඩ් එකේ ට්රාන්ස් ඇක්ෂන් එකක් ගැන පොඩ්ඩක් දැනගන්න ඕනෙ. ඊයේ හවස හතරයි 45 ට විතර මම ඔන්ලයින් පේමන්ට් එකක් කළා. රුපියල් 28,000 පන්සිය පනහක්. ඒක මගේ ෆෝන් එකෙන් ඩී ඩක් වෙලා තියෙනවා. හැබැයි මචං එකට ගිහින් නැහැ කියලා ඇප් එකේ පෙන්නන්නේ. මගේ එන් අයි සී නම් 2 ක් ඉන්න පොඩ්ඩක් 94 යි 25 යි 60 එකයි 200 තිස් හතරයි වී. A නෑ සොරි අන්තිමට එක් 12 යි 35 වී එන්න ඕනෙ. මගේ ඊමේල් 1 නිමල් ජයසූරිය අසූ අටයි ඇත් ජීමේල් ඩොට් කොම් එකට චෙක් කරල කියන්නකො මොකද වෙලා තියෙන්නේ කියලා. මම අදම 1 සෙට් කරගන්න ඕනේ මට."
        },
        {
          "provider": "openai",
          "status": "API credits exhausted in setup",
          "firstSeconds": null
        },
        {
          "provider": "groq",
          "status": "Complete",
          "firstSeconds": 6.07,
          "intentCorrect": false,
          "detectedGoal": "no clear goal",
          "details": {
            "debited_merchant_missing": {
              "expected": true,
              "actual": null,
              "correct": false
            },
            "amount_lkr": {
              "expected": "28550",
              "actual": null,
              "correct": false
            },
            "payment_time": {
              "expected": "16:45",
              "actual": null,
              "correct": false
            },
            "corrected_nic_end": {
              "expected": "1235V",
              "actual": null,
              "correct": false
            },
            "email": {
              "expected": "nimal.jayasuriya88@gmail.com",
              "actual": null,
              "correct": false
            }
          },
          "summary": "Review 5 fields",
          "transcript": "හිතින් විටික් විටික් මේදුයේ් පිටික් පිටික් පිටික් කිරින් ප්‍රතියන් දෙන් දෙන් දැන්නේ, නැම අපි හාන් නැත්තියක් මිනිසිත් මිනිසිත් මේදුන්ටම් අමුත්. පිනින්නේ පිනින්ටෝරු. ඒක මේදුදුන්ටෝරු කියෙන්නේ පුත් මේ මේදුන්ටෝරේ මේදුන්ටෝරේ කට්ටින්ටි කියෙන්ට අපි අපි කියෙන්ටින්ටි. මිනින්ලි නැන්නේ නැන්නේ නැතින්ටෝරු. අනිතුත්ත්ත්ත්ත්ත් හැන් විනින් සිටිතියි. අනිත්ති කිසිටික් සිටිතු වැන්නේ. එකන්නේ මිනිතිතියි අතික් කරන්නේ කියන්නේ මිනිතියක් කියන්නේ. අපි. මිදුන්ට කරන්ට 3 කරන්ට. නැත්තට මේදද්න්ට මිනිදුනවක කිරීමේ් කිරී."
        }
      ]
    },
    {
      "id": "southern_accent/clean",
      "label": "Southern Sinhala accent",
      "audio": "assets/southern-accent.wav",
      "goal": "Report an internet outage and request a technician",
      "finding": "All three leaders recovered the corrected visit time (10:30). Every scored model missed the account number.",
      "fields": [
        {
          "id": "red_router_light",
          "label": "Blinking red router light"
        },
        {
          "id": "account",
          "label": "Account number"
        },
        {
          "id": "corrected_visit_time",
          "label": "Corrected technician time"
        },
        {
          "id": "old_road_matara_bridge",
          "label": "Matara Old Road near the bridge"
        },
        {
          "id": "prior_complaint",
          "label": "Unanswered earlier complaint"
        }
      ],
      "results": [
        {
          "provider": "deepgram",
          "status": "Complete",
          "firstSeconds": 1.42,
          "intentCorrect": true,
          "detectedGoal": "an internet outage and technician visit",
          "details": {
            "red_router_light": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "account": {
              "expected": "0045889210",
              "actual": "24589210",
              "correct": false
            },
            "corrected_visit_time": {
              "expected": "10:30",
              "actual": "10:30",
              "correct": true
            },
            "old_road_matara_bridge": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "prior_complaint": {
              "expected": true,
              "actual": true,
              "correct": true
            }
          },
          "summary": "Review account number",
          "transcript": "හෙලෝ අයිබෝ අපේ ගෙදර ඉන්ටරනෙට් කනෙක්ෂන් එක ඊය රෑ ඉඳන් වැඩ කරන්නේ නෑ අප්පා. රවටර් එකේ රෙඩ්ලයි එකක් ලිනක් වෙනවා එක දිගටම. එකවුන්ට් නම්බර් එක (2 45යි. 89210 ගිය සතියෙත් ඔවුන් ඔහොමයි වුණේ. මම ඊය කම්ප්ලේන් එකක් දාලා තිබ්බේ. තාම කවුරුවත් කතා කරේ නෑ. ටනිෂන් කෙනෙක් එවන්න පුළුවන් නම් හෙට උදේ නමය හමාරට විතර ආ නෑ නෑ 10 30ට විතර කියන්නකෝ අපේ ගෙදර තියෙන්නේ මාතර පරණ පාරේ පාලම ළඟ."
        },
        {
          "provider": "gemini",
          "status": "Complete",
          "firstSeconds": 3.11,
          "intentCorrect": true,
          "detectedGoal": "an internet outage and technician visit",
          "details": {
            "red_router_light": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "account": {
              "expected": "0045889210",
              "actual": "0245889210",
              "correct": false
            },
            "corrected_visit_time": {
              "expected": "10:30",
              "actual": "10:30",
              "correct": true
            },
            "old_road_matara_bridge": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "prior_complaint": {
              "expected": true,
              "actual": true,
              "correct": true
            }
          },
          "summary": "Review account number",
          "transcript": "Hello, ayubowan. කොහomයි? අපේ ගෙදර ඉන්ටර්නෙට් කනෙක්ෂන් එක ඊයේ රෑ ඉඳන් වැඩ කරන්නේ නැහැ අප්පා.  රවුട്ടර් එකේ රെඩ් ලයිට්  එකක් බ්ලින්ක් වෙනවා එක දිගටම. එකවුන්ට් නම්බර් එක 0245 889210 ගිය සතියෙත් ඕන් ඔහොමමයි වുനേ. මම ඊයේ කම්ප්ලේන් එකක් දාලා තිබ්బේ. තාම කවුරුත් කതാ කරේ නැහැ. ටෙක්නිෂන් කෙනෙක් එවන්න පුළුවන් නම් හෙට උദേ 9:30 ට විතර ආ නැහැ නැහැ 10:30 ට විතර එන්න කියන්නකෝ. අපේ ගෙදර තියෙන්නේ මාතර පරණ පാരේ. පාලම ළඟ."
        },
        {
          "provider": "azure",
          "status": "Complete",
          "firstSeconds": 1.86,
          "intentCorrect": true,
          "detectedGoal": "an internet outage and technician visit",
          "details": {
            "red_router_light": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "account": {
              "expected": "0045889210",
              "actual": "10245889210",
              "correct": false
            },
            "corrected_visit_time": {
              "expected": "10:30",
              "actual": "10:30",
              "correct": true
            },
            "old_road_matara_bridge": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "prior_complaint": {
              "expected": true,
              "actual": true,
              "correct": true
            }
          },
          "summary": "Review account number",
          "transcript": "හෙල වූ ආයුබෝවන් කොහොමෙයි අපේ ගෙදර ඉන්ටනෙට් කනෙක්ෂන් 1 ඊයේ රෑ ඉඳන් වැඩ කරන්නෙ අප්පා රවුටර් එකේ රෙඩ් ලයිට් එකක් ලින්ක් වෙනවා 1 දිගටම. එකවුන්ට් නම්බර් 1 0 2 45 යි. 88 92 10. ගිය සතියෙත් ඕං ඔහොමයි වුනේ. මම ඊයේ කම්ප්ලේන් එකක් දාල තිබ්බෙ තාම කවුරුවත් කතා කළේ නෑ. ටෙක්නීෂියන් කෙනෙක් එවන්න පුළුවන්නම් හෙට උදේ නමය හමාරට. විතර අනේ නෑ දහයයි තිහට විතර එන්න කියන්නකො. අපේ ගෙදර තියෙන්නේ මාතර පරණ පාරේ පාලම ළඟ."
        },
        {
          "provider": "openai",
          "status": "API credits exhausted in setup",
          "firstSeconds": null
        },
        {
          "provider": "groq",
          "status": "Complete",
          "firstSeconds": 5.88,
          "intentCorrect": false,
          "detectedGoal": "no clear goal",
          "details": {
            "red_router_light": {
              "expected": true,
              "actual": null,
              "correct": false
            },
            "account": {
              "expected": "0045889210",
              "actual": null,
              "correct": false
            },
            "corrected_visit_time": {
              "expected": "10:30",
              "actual": null,
              "correct": false
            },
            "old_road_matara_bridge": {
              "expected": true,
              "actual": null,
              "correct": false
            },
            "prior_complaint": {
              "expected": true,
              "actual": null,
              "correct": false
            }
          },
          "summary": "Review 5 fields",
          "transcript": "හිතින් ආදුමු කොමුන්? අපි එක්ටෝර්ත් හැන්ටින් එක්ටෝර්ත් කිරීමෙන් නැතින් මෙන්ත් කරන්නේ. නිටිත්ටම් කියන්නේ එක් පිතිත්ටම් නැදි කට්ටිටු කියන් පැන්තින් කට්ටිටු අක්රුද්ම අපි එක්රුද්ම බිත්ත්ත්ත් අපි අපි දැන්නේ දැන්නේ. හි හි මානින්න නැටින් හිතුරුදුවේ? මිනින්ටික් කප්පාකට පෙත්ත් තාන්නේ තාන්ටික් කතාක්නේ. තියෙන්නේ එක්යින්ටි කියෙන්ටි හැදින් පසුද්ටින්. නැතින් මේදුන් කිරීම අති නැද්දුව්ටට කරන්න ක්ෂණියට අපි. අපි කියන්දුන්න මේ සහ පුතු පුතු පාලින්නේ. පෙති කරන්න."
        }
      ]
    },
    {
      "id": "pause_and_talk/clean",
      "label": "Pauses and restarts",
      "audio": "assets/pause-clean.wav",
      "goal": "Explain when they use public hospitals",
      "finding": "",
      "fields": [
        {
          "id": "avoids_minor",
          "label": "Avoids public hospitals for minor illness"
        },
        {
          "id": "congestion",
          "label": "Overcrowding"
        },
        {
          "id": "work_schedule",
          "label": "Treatment hours conflict with work"
        },
        {
          "id": "uses_serious",
          "label": "Uses public hospitals for serious illness or emergencies"
        }
      ],
      "results": [
        {
          "provider": "deepgram",
          "status": "Complete",
          "firstSeconds": 1.42,
          "intentCorrect": true,
          "detectedGoal": "when to use public hospitals",
          "details": {
            "avoids_minor": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "congestion": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "work_schedule": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "uses_serious": {
              "expected": true,
              "actual": true,
              "correct": true
            }
          },
          "summary": "All fields recovered",
          "transcript": "සුළු අසනීපයක් සඳහා මම රජයේ රෝහල් වගේ නිදහස පහසුකම් පාවිච්චි කරන්නේ නෑ. ඒකට හේතුව තමයි ඒවයේ තදබදය වැඩි එකයි. මේ ප් රතිකාර ලබාගන්න වෙලාවලුත් වැඩ කරන කෙනෙක්ට යන්න පහසු නෑ. ඒ වුනාට වඩා ලොකු රෝග තත්ත්වයක් වගේ දෙයක් හරි හදිසියක් හරි හදිසි අනතුරක් හරි වුණත්, රජය් රෝහල්වන් ල ප් රතිකාර වඩා හොඳ නිසා පාවිච්චි කරනවා."
        },
        {
          "provider": "gemini",
          "status": "Complete",
          "firstSeconds": 14.16,
          "intentCorrect": true,
          "detectedGoal": "when to use public hospitals",
          "details": {
            "avoids_minor": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "congestion": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "work_schedule": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "uses_serious": {
              "expected": true,
              "actual": true,
              "correct": true
            }
          },
          "summary": "All fields recovered",
          "transcript": "සුළු වසන ඉප്യක් සඳහා මම රජයේ රෝහල් වගේ නිදහස් සෞඛ්‍ය පහසුකම් පාවිච්චි කරන්නේ නැහැ. ඒකට හේතුව තමයි ඒවායේ තදබදය වැඩියි එකයි. අනික මේ ප්‍රතිකාර ලබා ගන්න වෙലാവുലുත් වැඩ කරන කෙනෙක්ට යන්න පහසු වුණා. ඒ වුණාට වඩා ලොකු රෝග තത്ത്വයක් වගේ දෙයක් හරි හදිසියක් හරි හදිසි අනතුරක් හරි වුණොත් රජයේ රෝහල් වල ප්‍රතිකාර වඩා හොඳ නිසා පාවිච්චි කරනවා."
        },
        {
          "provider": "azure",
          "status": "Complete",
          "firstSeconds": 1.95,
          "intentCorrect": true,
          "detectedGoal": "when to use public hospitals",
          "details": {
            "avoids_minor": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "congestion": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "work_schedule": {
              "expected": true,
              "actual": true,
              "correct": true
            },
            "uses_serious": {
              "expected": true,
              "actual": true,
              "correct": true
            }
          },
          "summary": "All fields recovered",
          "transcript": "සුළු අසනීපයක් සඳහා මම රජයේ රෝහල් වගේ නිදහස් සෞඛ්ය පහසුකම් පාවිච්චි කරන්නෙ නෑ. ඒකට හේතුව තමයි ඒවා තදබදය වැඩි එකයි. අක්ක මේ ප්රතිකාර ලබා ගන්න වෙලාවලුත්. වැඩ කරන කෙනෙක් යන්න පහසු නෑ අ එ වුනාට. වඩා ලොකු රෝග තත්වයක් වගේ දෙයක් හරි හදිසියක් හරි හදිසි අනතුරක් හරි වුණොත් රජයේ රෝහල්වල ප්රතිකාර වඩා හොඳ නිසා පාවිච්චි කරනවා."
        },
        {
          "provider": "openai",
          "status": "API credits exhausted in setup",
          "firstSeconds": null
        },
        {
          "provider": "groq",
          "status": "Complete",
          "firstSeconds": 6.04,
          "intentCorrect": false,
          "detectedGoal": "no clear goal",
          "details": {
            "avoids_minor": {
              "expected": true,
              "actual": null,
              "correct": false
            },
            "congestion": {
              "expected": true,
              "actual": null,
              "correct": false
            },
            "work_schedule": {
              "expected": true,
              "actual": null,
              "correct": false
            },
            "uses_serious": {
              "expected": true,
              "actual": null,
              "correct": false
            }
          },
          "summary": "Review 4 fields",
          "transcript": "මිනින්නේ එක්ලායක් අපි මෙමින්නේ මිනින්නේ නැතන්ටිකි පස්තියෙන් කරන්නේ. ඒක මිනිත්ත්ත් දැන්නේ තෙලියෙන්. කන්නයක් කියන්න කියන්න. අපි කියන්න පිටිතිතියේ කිරිමික කිරිමික කිරිමික විස්ටිමි විස්සිත් කිරින්න. එක් කිරීම් කොඩුදුන් කිරීම් කිරීම් කිරීම් දිකුරුද්ට තාන්නේ එකාරුද්ට අටිටික් අටිටික් අපි. නත්තත්ත් කෝලින් කිලින් කියන්න."
        }
      ]
    }
  ]
};
