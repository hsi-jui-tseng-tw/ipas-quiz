param(
    [switch]$ShowNearDuplicates
)

$ErrorActionPreference = "Stop"
$errors = [System.Collections.Generic.List[string]]::new()
$warnings = [System.Collections.Generic.List[string]]::new()

function Add-ValidationError([string]$Message) {
    $script:errors.Add($Message)
}

function Has-Property($Object, [string]$Name) {
    return $null -ne $Object -and $Object.PSObject.Properties.Name -contains $Name
}

function Get-TrimmedText($Value) {
    if ($null -eq $Value) {
        return ""
    }
    return ([string]$Value).Trim()
}

function Get-UnicodeCharacterCount($Value) {
    $text = Get-TrimmedText $Value
    if ($text.Length -eq 0) {
        return 0
    }
    return [System.Globalization.StringInfo]::ParseCombiningCharacters($text).Count
}

function New-OrdinalDictionary {
    return [System.Collections.Generic.Dictionary[string,string]]::new(
        [System.StringComparer]::Ordinal
    )
}

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$examDirectory = Join-Path $repositoryRoot "exam\json"

$planningSubject = '"\u8cc7\u8a0a\u5b89\u5168\u898f\u5283\u5be6\u52d9"' | ConvertFrom-Json
$protectionSubject = '"\u8cc7\u8a0a\u5b89\u5168\u9632\u8b77\u5be6\u52d9"' | ConvertFrom-Json
$filePrefix = '"115-2\u9810\u6e2c-\u7b2c"' | ConvertFrom-Json
$fileMiddle = '"\u56de\u8cc7\u8a0a\u5b89\u5168\u5de5\u7a0b\u5e2b-"' | ConvertFrom-Json
$singleType = '"\u55ae\u9078\u984c"' | ConvertFrom-Json
$multiType = '"\u8907\u9078\u984c"' | ConvertFrom-Json
$caseSingleType = '"\u984c\u7d44"' | ConvertFrom-Json
$caseMultiType = '"\u984c\u7d44\uff08\u8907\u9078\uff09"' | ConvertFrom-Json
$placeholderPattern = '(?i)(?:\bTODO\b|\bTBD\b|\bFIXME\b|\bPLACEHOLDER\b|LOREM\s+IPSUM|待補|待填)'
$illegalControlCharacterPattern = '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]'

$planningChapters = [ordered]@{
    "1.1" = 10
    "1.2" = 5
    "1.3" = 14
    "2.1" = 5
    "2.2" = 6
}
$protectionChapters = [ordered]@{
    "3.1" = 14
    "3.2" = 10
    "4.1" = 7
    "4.2" = 9
}

$expectedFiles = [System.Collections.Generic.List[object]]::new()
foreach ($round in 1..30) {
    foreach ($subject in @($planningSubject, $protectionSubject)) {
        $fileName = $filePrefix + $round.ToString("00") + $fileMiddle + $subject + ".json"
        $expectedFiles.Add([pscustomobject]@{
            Round = $round
            Subject = $subject
            Name = $fileName
            Path = Join-Path $examDirectory $fileName
        })
    }
}

$documents = [System.Collections.Generic.List[object]]::new()
$newPaths = New-OrdinalDictionary

foreach ($expected in $expectedFiles) {
    $newPaths[$expected.Path] = $expected.Name
    if (-not (Test-Path -LiteralPath $expected.Path -PathType Leaf)) {
        Add-ValidationError "Missing expected file: $($expected.Name)"
        continue
    }

    try {
        $data = Get-Content -LiteralPath $expected.Path -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Add-ValidationError "$($expected.Name): invalid JSON: $($_.Exception.Message)"
        continue
    }

    if (-not (Has-Property $data "metadata") -or $null -eq $data.metadata) {
        Add-ValidationError "$($expected.Name): missing metadata object"
        continue
    }
    foreach ($field in @("exam_name", "subject", "date")) {
        if (-not (Has-Property $data.metadata $field) -or
            [string]::IsNullOrWhiteSpace((Get-TrimmedText $data.metadata.$field))) {
            Add-ValidationError "$($expected.Name): metadata.$field is missing or empty"
        }
    }
    if ((Get-TrimmedText $data.metadata.subject) -ne $expected.Subject) {
        Add-ValidationError "$($expected.Name): metadata.subject does not match the filename subject"
    }

    if (-not (Has-Property $data "questions")) {
        Add-ValidationError "$($expected.Name): missing questions array"
        continue
    }
    $questions = @($data.questions)
    if ($questions.Count -ne 40) {
        Add-ValidationError "$($expected.Name): expected 40 questions, found $($questions.Count)"
    }

    $singleAnswerCount = 0
    $multiAnswerCount = 0
    $nonCaseCount = 0
    $caseCount = 0
    $chapterCounts = @{}

    for ($index = 0; $index -lt $questions.Count; $index++) {
        $question = $questions[$index]
        $questionId = if (Has-Property $question "id") {
            Get-TrimmedText $question.id
        } else {
            "missing-id-at-index-$($index + 1)"
        }
        $reference = "$($expected.Name)#$questionId"

        foreach ($field in @(
            "id",
            "type",
            "answer",
            "question_text",
            "options",
            "explanation",
            "chapter",
            "competency"
        )) {
            if (-not (Has-Property $question $field)) {
                Add-ValidationError "$reference`: missing field '$field'"
            }
        }

        if (-not (Has-Property $question "id") -or
            $question.id -isnot [int] -or
            $question.id -ne ($index + 1)) {
            Add-ValidationError "$reference`: id must be integer $($index + 1)"
        }

        foreach ($field in @("type", "answer", "question_text", "explanation", "chapter", "competency")) {
            if (Has-Property $question $field) {
                if ([string]::IsNullOrWhiteSpace((Get-TrimmedText $question.$field))) {
                    Add-ValidationError "$reference`: field '$field' is empty"
                }
            }
        }
        if ((Has-Property $question "explanation") -and
            -not [string]::IsNullOrWhiteSpace((Get-TrimmedText $question.explanation))) {
            $explanationLength = Get-UnicodeCharacterCount $question.explanation
            if ($explanationLength -lt 30) {
                Add-ValidationError "$reference`: explanation must contain at least 30 Unicode characters; found $explanationLength"
            }
        }

        $optionKeys = @()
        if (-not (Has-Property $question "options") -or
            $null -eq $question.options -or
            $question.options -isnot [pscustomobject]) {
            Add-ValidationError "$reference`: options must be an object"
        } else {
            $optionKeys = @($question.options.PSObject.Properties.Name)
            if (($optionKeys -join "") -cne "ABCD") {
                Add-ValidationError "$reference`: option keys must be exactly A, B, C, D in order"
            }
            $uniqueOptionTexts = New-OrdinalDictionary
            foreach ($key in @("A", "B", "C", "D")) {
                if (-not (Has-Property $question.options $key) -or
                    [string]::IsNullOrWhiteSpace((Get-TrimmedText $question.options.$key))) {
                    Add-ValidationError "$reference`: option $key is missing or empty"
                    continue
                }
                $optionText = Get-TrimmedText $question.options.$key
                if ($uniqueOptionTexts.ContainsKey($optionText)) {
                    Add-ValidationError "$reference`: option $key duplicates option $($uniqueOptionTexts[$optionText]) text"
                } else {
                    $uniqueOptionTexts[$optionText] = $key
                }
            }
        }

        $answer = Get-TrimmedText $question.answer
        if ($answer -cnotmatch "^[A-D]+$") {
            Add-ValidationError "$reference`: answer '$answer' must contain only uppercase A-D"
        } else {
            $answerLetters = @($answer.ToCharArray() | ForEach-Object { [string]$_ })
            if (@($answerLetters | Sort-Object -Unique).Count -ne $answerLetters.Count) {
                Add-ValidationError "$reference`: answer '$answer' contains duplicate letters"
            }
            if ($answer.Length -gt 1) {
                $sortedAnswer = @($answerLetters | Sort-Object) -join ""
                if ($answer -cne $sortedAnswer) {
                    Add-ValidationError "$reference`: multi-answer '$answer' must list letters in ascending A-D order"
                }
            }
            foreach ($letter in $answerLetters) {
                if ($letter -notin $optionKeys) {
                    Add-ValidationError "$reference`: answer '$answer' refers to missing option $letter"
                }
            }
        }

        $isMultiAnswer = $answer.Length -gt 1
        if ($isMultiAnswer) {
            $multiAnswerCount++
        } else {
            $singleAnswerCount++
        }

        $type = Get-TrimmedText $question.type
        $isCase = $type -eq $caseSingleType -or $type -eq $caseMultiType
        $isNonCase = $type -eq $singleType -or $type -eq $multiType
        if (-not $isCase -and -not $isNonCase) {
            Add-ValidationError "$reference`: unsupported question type '$type'"
        }
        if ($isCase) {
            $caseCount++
        } elseif ($isNonCase) {
            $nonCaseCount++
        }

        $expectedType = if ($isCase) {
            if ($isMultiAnswer) { $caseMultiType } else { $caseSingleType }
        } else {
            if ($isMultiAnswer) { $multiType } else { $singleType }
        }
        if (($isCase -or $isNonCase) -and $type -ne $expectedType) {
            Add-ValidationError "$reference`: type '$type' conflicts with answer '$answer'"
        }

        if ($isCase) {
            if (-not (Has-Property $question "case_group") -or
                $null -eq $question.case_group -or
                $question.case_group -isnot [pscustomobject]) {
                Add-ValidationError "$reference`: case_group must be an object"
            } else {
                $caseKeys = @($question.case_group.PSObject.Properties.Name | Sort-Object)
                if (($caseKeys -join ",") -ne "description,id") {
                    Add-ValidationError "$reference`: case_group must contain exactly id and description"
                }
                foreach ($field in @("id", "description")) {
                    if (-not (Has-Property $question.case_group $field) -or
                        [string]::IsNullOrWhiteSpace((Get-TrimmedText $question.case_group.$field))) {
                        Add-ValidationError "$reference`: case_group.$field is missing or empty"
                    }
                }
            }
        } elseif (Has-Property $question "case_group" -and $null -ne $question.case_group) {
            Add-ValidationError "$reference`: non-case question must not define case_group"
        }

        $contentFields = [ordered]@{}
        foreach ($field in @("question_text", "explanation", "competency")) {
            if (Has-Property $question $field) {
                $contentFields[$field] = Get-TrimmedText $question.$field
            }
        }
        if ($null -ne $question.options -and $question.options -is [pscustomobject]) {
            foreach ($key in @("A", "B", "C", "D")) {
                if (Has-Property $question.options $key) {
                    $contentFields["options.$key"] = Get-TrimmedText $question.options.$key
                }
            }
        }
        if ($isCase -and
            $null -ne $question.case_group -and
            $question.case_group -is [pscustomobject] -and
            (Has-Property $question.case_group "description")) {
            $contentFields["case_group.description"] = Get-TrimmedText $question.case_group.description
        }
        foreach ($fieldName in $contentFields.Keys) {
            $content = $contentFields[$fieldName]
            if ($content -match $placeholderPattern) {
                Add-ValidationError "$reference`: field '$fieldName' contains a placeholder marker"
            }
            if ($content.Contains([string][char]0xFFFD)) {
                Add-ValidationError "$reference`: field '$fieldName' contains Unicode replacement character U+FFFD"
            }
            if ($content -match $illegalControlCharacterPattern) {
                Add-ValidationError "$reference`: field '$fieldName' contains an illegal control character"
            }
        }

        $chapter = Get-TrimmedText $question.chapter
        if (-not $chapterCounts.ContainsKey($chapter)) {
            $chapterCounts[$chapter] = 0
        }
        $chapterCounts[$chapter]++
    }

    if ($singleAnswerCount -ne 30 -or $multiAnswerCount -ne 10) {
        Add-ValidationError "$($expected.Name): expected 30 single-answer and 10 multi-answer questions; found $singleAnswerCount/$multiAnswerCount"
    }
    if ($nonCaseCount -ne 20 -or $caseCount -ne 20) {
        Add-ValidationError "$($expected.Name): expected 20 non-case and 20 case questions; found $nonCaseCount/$caseCount"
    }

    $caseQuestions = @($questions | Where-Object {
        $_.type -eq $caseSingleType -or $_.type -eq $caseMultiType
    })
    $caseGroups = @($caseQuestions | Where-Object {
        $null -ne $_.case_group -and -not [string]::IsNullOrWhiteSpace((Get-TrimmedText $_.case_group.id))
    } | Group-Object { Get-TrimmedText $_.case_group.id })
    if ($caseGroups.Count -ne 5) {
        Add-ValidationError "$($expected.Name): expected 5 case groups, found $($caseGroups.Count)"
    }
    foreach ($group in $caseGroups) {
        if ($group.Count -ne 4) {
            Add-ValidationError "$($expected.Name): case group '$($group.Name)' must contain 4 questions; found $($group.Count)"
        }
        $descriptions = @($group.Group | ForEach-Object {
            Get-TrimmedText $_.case_group.description
        } | Sort-Object -Unique)
        if ($descriptions.Count -ne 1) {
            Add-ValidationError "$($expected.Name): case group '$($group.Name)' must use one consistent description"
        }
    }

    $expectedChapters = if ($expected.Subject -eq $planningSubject) {
        $planningChapters
    } else {
        $protectionChapters
    }
    foreach ($chapter in $expectedChapters.Keys) {
        $actual = if ($chapterCounts.ContainsKey($chapter)) { $chapterCounts[$chapter] } else { 0 }
        if ($actual -ne $expectedChapters[$chapter]) {
            Add-ValidationError "$($expected.Name): chapter $chapter expected $($expectedChapters[$chapter]), found $actual"
        }
    }
    foreach ($chapter in $chapterCounts.Keys) {
        if (-not $expectedChapters.Contains($chapter)) {
            Add-ValidationError "$($expected.Name): unexpected chapter '$chapter'"
        }
    }

    $documents.Add([pscustomobject]@{
        File = $expected.Name
        Subject = $expected.Subject
        Questions = $questions
    })
}

$newQuestionLocations = New-OrdinalDictionary
foreach ($document in $documents) {
    foreach ($question in $document.Questions) {
        $text = Get-TrimmedText $question.question_text
        if ([string]::IsNullOrWhiteSpace($text)) {
            continue
        }
        $location = "$($document.File)#$($question.id)"
        if ($newQuestionLocations.ContainsKey($text)) {
            Add-ValidationError "Exact duplicate among new exams: $location matches $($newQuestionLocations[$text])"
        } else {
            $newQuestionLocations[$text] = $location
        }
    }
}

$oldQuestionLocations = New-OrdinalDictionary
foreach ($file in Get-ChildItem -LiteralPath $examDirectory -Filter "*.json" -File) {
    if ($newPaths.ContainsKey($file.FullName)) {
        continue
    }
    try {
        $data = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
        Add-ValidationError "$($file.Name): cannot parse old exam for duplicate comparison: $($_.Exception.Message)"
        continue
    }
    foreach ($question in @($data.questions)) {
        $text = Get-TrimmedText $question.question_text
        if (-not [string]::IsNullOrWhiteSpace($text) -and -not $oldQuestionLocations.ContainsKey($text)) {
            $oldQuestionLocations[$text] = "$($file.Name)#$($question.id)"
        }
    }
}

foreach ($entry in $newQuestionLocations.GetEnumerator()) {
    if ($oldQuestionLocations.ContainsKey($entry.Key)) {
        Add-ValidationError "Exact duplicate with old exam: $($entry.Value) matches $($oldQuestionLocations[$entry.Key])"
    }
}

foreach ($subject in @($planningSubject, $protectionSubject)) {
    $subjectDocuments = @($documents | Where-Object { $_.Subject -eq $subject })
    for ($leftIndex = 0; $leftIndex -lt $subjectDocuments.Count; $leftIndex++) {
        $left = $subjectDocuments[$leftIndex]
        for ($rightIndex = $leftIndex + 1; $rightIndex -lt $subjectDocuments.Count; $rightIndex++) {
            $right = $subjectDocuments[$rightIndex]
            $rightTexts = New-OrdinalDictionary
            foreach ($question in $right.Questions) {
                $text = Get-TrimmedText $question.question_text
                if (-not [string]::IsNullOrWhiteSpace($text) -and -not $rightTexts.ContainsKey($text)) {
                    $rightTexts[$text] = ""
                }
            }
            $overlap = 0
            foreach ($question in $left.Questions) {
                if ($rightTexts.ContainsKey((Get-TrimmedText $question.question_text))) {
                    $overlap++
                }
            }
            $differenceRate = (40 - $overlap) / 40.0
            if ($differenceRate -lt 0.70) {
                Add-ValidationError ("Same-subject difference below 70%: {0} vs {1} = {2:P1}" -f
                    $left.File,
                    $right.File,
                    $differenceRate)
            }
        }
    }
}

if ($ShowNearDuplicates) {
    $normalizedLocations = New-OrdinalDictionary
    foreach ($entry in $newQuestionLocations.GetEnumerator()) {
        $normalized = $entry.Key.ToLowerInvariant() -replace "[\p{P}\p{S}\s]+", ""
        if ($normalized.Length -lt 12) {
            continue
        }
        if ($normalizedLocations.ContainsKey($normalized)) {
            $warnings.Add("Near-duplicate after punctuation normalization: $($entry.Value) and $($normalizedLocations[$normalized])")
        } else {
            $normalizedLocations[$normalized] = $entry.Value
        }
    }
}

foreach ($warning in $warnings) {
    Write-Warning $warning
}

if ($errors.Count -gt 0) {
    foreach ($validationError in $errors) {
        Write-Output "[ERROR] $validationError"
    }
    Write-Output "Validation failed: $($errors.Count) error(s), $($warnings.Count) warning(s)."
    exit 1
}

$validatedQuestionCount = ($documents | ForEach-Object {
    @($_.Questions).Count
} | Measure-Object -Sum).Sum
Write-Output "Validation passed: $($documents.Count) files, $validatedQuestionCount questions, 0 exact duplicates, all same-subject pairs differ by at least 70%."
if ($ShowNearDuplicates) {
    Write-Output "Near-duplicate diagnostics: $($warnings.Count) warning(s)."
}
